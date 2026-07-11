import os
import json
import queue
import threading
from datetime import datetime
from sqlalchemy.orm import Session
from db import global_init, create_session
from db.__all_models import *
from news_parsers import import_parsers
import tqdm



class NewsImporter:
    def __init__(self, db_url: str=None, workers: int=10):
        self.db_url = db_url
        self.workers = workers
        self.parsers = import_parsers()
        self.tasks = queue.Queue()
        self.progress = queue.Queue()
        self.to_save = queue.Queue()
        self.stop = threading.Event()
        self.engine = global_init(db_url)
        self.session = create_session()

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
        sess = Session(self.engine)
        while True:
            task = self.tasks.get()
            if task is None:
                break
            parser = self._get_parser(task["url"])
            if not parser:
                self.progress.put(1)
                continue
            try:
                data = parser.get_news(task["url"])
                if data.get("title"):
                    news = News(
                        id=task["id"],
                        title=data["title"],
                        content=data["content"],
                        date=datetime.strptime(task["published_at"], "%Y-%m-%d").date(),
                        source=task["source"],
                        category=data.get("category")
                    )
                    if not sess.query(News).filter(News.id == news.id).first():
                        self.to_save.put(news)
                self.progress.put(1)
            except Exception:
                self.progress.put(1)
        sess.close()

    def _get_parser(self, url):
        for prefix, parser in self.parsers.items():
            if url.startswith(prefix):
                return parser
        return None

    def _monitor(self, total):
        batch = []
        with tqdm.tqdm(total=total, desc="Импорт", unit="запись") as pbar:
            while True:
                self._process_progress(pbar)
                self._flush_batch(batch)
                if self._done():
                    break
        self.session.close()

    def _process_progress(self, pbar):
        try:
            if self.progress.get(timeout=0.1) == 1:
                pbar.update(1)
        except queue.Empty:
            pass

    def _flush_batch(self, batch):
        try:
            news = self.to_save.get_nowait()
            batch.append(news)
            if len(batch) >= 100:
                for n in batch:
                    self.session.merge(n)
                self.session.commit()
                batch.clear()
        except queue.Empty:
            pass

    def _done(self):
        return (all(not t.is_alive() for t in threading.enumerate() 
                    if t.name.startswith("Thread") and t.daemon) 
                and self.tasks.empty() and self.to_save.empty())



if __name__ == "__main__":
    importer = NewsImporter(workers=10)
    importer.run(os.path.join(os.path.dirname(__file__), "dbtest",
                              "news_merged_20260624_125713.jsonl"))