from sqlalchemy import select
import threading
import queue
import tqdm

from database.engine import session_maker_sync
from database import ImpactSignal, News
from llm.project_extractor import ProjectExtractor
from ml.risk.risk import RiskPredictor
from .entity_matcher import resolve_city, resolve_developer, resolve_project


class ImpactSignalsCreator:
    def __init__(self, workers: int = 10, progress: bool = False):
        self.workers = workers
        self.progress_enabled = progress
        self.project_extractor = ProjectExtractor()
        self.risk_predictor = RiskPredictor()
        self.tasks = queue.Queue()
        self.progress_queue = queue.Queue()
        self.stop = threading.Event()

    def run(self):
        reader = threading.Thread(target=self._reader, daemon=True)
        reader.start()
        workers = [threading.Thread(target=self._worker, daemon=True) for _ in range(self.workers)]
        for w in workers: w.start()
        session = session_maker_sync()
        try:
            total = (session.query(News)
                     .outerjoin(ImpactSignal, ImpactSignal.news_id == News.id)
                     .filter(ImpactSignal.id.is_(None)).count())
        finally:
            session.close()
        if self.progress_enabled:
            self._monitor(total)
        else:
            self._drain()
        for w in workers: w.join()
        reader.join()

    def _reader(self):
        session = session_maker_sync()
        try:
            stmt = (select(News.id)
                    .outerjoin(ImpactSignal, ImpactSignal.news_id == News.id)
                    .where(ImpactSignal.id.is_(None)))
            for row in session.execute(stmt).scalars().all():
                if self.stop.is_set():
                    break
                self.tasks.put(row)
        finally:
            session.close()
        for _ in range(self.workers):
            self.tasks.put(None)

    @staticmethod
    def resolve_and_create(news: News, project_elements: dict[str, str | None],
                           risk_level: int, session) -> ImpactSignal:
        city_id = resolve_city(project_elements.get("city"), session)
        developer_id = resolve_developer(project_elements.get("developer"), session)
        project_id = resolve_project(
            project_elements.get("project"), developer_id, city_id, session)

        impact_signal = ImpactSignal(
            news_id=news.id, city_id=city_id, developer_id=developer_id,
            project_id=project_id, risk_level=risk_level)
        return impact_signal

    def _worker(self):
        session = session_maker_sync()
        try:
            while True:
                task = self.tasks.get()
                if task is None:
                    break
                news = session.get(News, task)
                if not news:
                    self.progress_queue.put(1)
                    continue
                project_elements = self.project_extractor.extract(news.content)
                risk_level = self.risk_predictor.predict_proba(news.content)
                impact_signal = self.resolve_and_create(
                    news, project_elements, risk_level, session)
                session.add(impact_signal)
                session.commit()
                self.progress_queue.put(1)
        finally:
            session.close()

    def _drain(self):
        while not self._done():
            try:
                self.progress_queue.get(timeout=0.5)
            except queue.Empty:
                pass

    def _monitor(self, total):
        with tqdm.tqdm(total=total, desc="ImpactSignals", unit="запись") as pbar:
            while not self._done():
                try:
                    if self.progress_queue.get(timeout=0.1) == 1:
                        pbar.update(1)
                except queue.Empty:
                    pass

    def _done(self):
        return (all(not t.is_alive() for t in threading.enumerate()
                    if t.name.startswith("Thread") and t.daemon) and self.tasks.empty())