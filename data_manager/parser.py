from datetime import datetime
import threading
import queue
import json
import tqdm
import os

from news_parsers import import_parsers, PARSERS
from backend.database.engine import session_maker_sync
from backend.database.models.news import ParseNews, News
from ml.news_validator.text import TextClassifier


class NewsImporter:
    def __init__(self, workers: int = 10):
        self.workers = workers
        self.tasks = queue.Queue()
        self.progress = queue.Queue()
        self.stop = threading.Event()

    def run(self, filepath: str):
        reader = threading.Thread(target=self._reader, args=(filepath,), daemon=True)
        reader.start()
        workers = [threading.Thread(target=self._worker, daemon=True) for _ in range(self.workers)]
        for w in workers: w.start()
        self._monitor(sum(1 for _ in open(filepath, 'r', encoding='utf-8')))
        for w in workers: w.join()
        reader.join()

    def _reader(self, filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            for line in f:
                if self.stop.is_set():
                    break
                self.tasks.put(json.loads(line))
        for _ in range(self.workers):
            self.tasks.put(None)

    def _worker(self):
        session = session_maker_sync()
        try:
            while True:
                task = self.tasks.get()
                if task is None:
                    break
                url = task["url"]
                known = any(url.startswith(prefix) for prefix in PARSERS)
                if not known:
                    self.progress.put(1)
                    continue
                try:
                    exists = session.query(ParseNews.id).filter_by(url=url).first()
                    if not exists:
                        record = ParseNews(url=url)
                        session.add(record)
                        session.commit()
                except Exception:
                    session.rollback()
                finally:
                    self.progress.put(1)
        finally:
            session.close()

    def _monitor(self, total):
        with tqdm.tqdm(total=total, desc="Импорт", unit="запись") as pbar:
            while not self._done():
                self._process_progress(pbar)

    def _process_progress(self, pbar):
        try:
            if self.progress.get(timeout=0.1) == 1:
                pbar.update(1)
        except queue.Empty:
            pass

    def _done(self):
        return (all(not t.is_alive() for t in threading.enumerate()
                    if t.name.startswith("Thread") and t.daemon)
                and self.tasks.empty())


class NewsParser:
    def __init__(self, workers: int = 10):
        self.workers = workers
        self.parsers = import_parsers()
        self.validator = TextClassifier()
        self.tasks = queue.Queue()
        self.progress = queue.Queue()
        self.stop = threading.Event()

    def run(self):
        reader = threading.Thread(target=self._reader, daemon=True)
        reader.start()
        workers = [threading.Thread(target=self._worker, daemon=True) for _ in range(self.workers)]
        for w in workers: w.start()
        session = session_maker_sync()
        try:
            total = session.query(ParseNews).filter(ParseNews.is_valid == None).count()
        finally:
            session.close()
        self._monitor(total)
        for w in workers: w.join()
        reader.join()

    def _reader(self):
        session = session_maker_sync()
        try:
            links = session.query(ParseNews).filter(ParseNews.is_valid == None).all()
            for link in links:
                if self.stop.is_set():
                    break
                self.tasks.put(link.id)
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
                link = session.query(ParseNews).get(task)
                if not link:
                    self.progress.put(1)
                    continue
                parser = self._get_parser(link.url)
                if not parser:
                    self.progress.put(1)
                    continue
                try:
                    data = parser.get_news(link.url)
                    if data and data.get("title"):
                        is_valid = bool(self.validator.predict(
                            data["title"] + " " + data.get("content", "")))
                        link.is_valid = is_valid
                        if is_valid:
                            news_record = News(
                                id=link.id, title=data["title"], content=data["content"],
                                date=datetime.strptime(data["date"], "%H:%M %d:%m:%Y"),
                                source=data.get("source"), category=data.get("category"))
                            session.add(news_record)
                        session.commit()
                except Exception:
                    session.rollback()
                finally:
                    self.progress.put(1)
        finally:
            session.close()

    def _get_parser(self, url):
        for prefix, parser in self.parsers.items():
            if url.startswith(prefix):
                return parser
        return None

    def _monitor(self, total):
        with tqdm.tqdm(total=total, desc="Парсинг", unit="запись") as pbar:
            while not self._done():
                self._process_progress(pbar)

    def _process_progress(self, pbar):
        try:
            if self.progress.get(timeout=0.1) == 1:
                pbar.update(1)
        except queue.Empty:
            pass

    def _done(self):
        return (all(not t.is_alive() for t in threading.enumerate()
                    if t.name.startswith("Thread") and t.daemon) and self.tasks.empty())


if __name__ == "__main__":
    importer = NewsImporter()
    importer.run(os.path.join(
        os.path.dirname(__file__), "dbtest", "news_merged_20260624_125713.jsonl"))
    parser = NewsParser()
    parser.run()