from sqlalchemy import select
import threading
import queue
import tqdm

from database.engine import session_maker_sync
from database import ImpactSignal, News
from llm.project_extractor import ProjectExtractor
from ml.risk.risk import RiskPredictor


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
                impact_signal = ImpactSignal(news_id=news.id)
                project_elements = self.project_extractor.extract(news.content)
                if any(v is not None for v in project_elements.values()):
                    impact_signal.city_id = project_elements.get("city")
                    impact_signal.developer_id = project_elements.get("developer")
                    impact_signal.project_id = project_elements.get("project")
                    impact_signal.risk_level = self.risk_predictor.predict_proba(news.content)
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