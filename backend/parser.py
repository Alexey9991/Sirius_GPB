import threading
import queue
import json
import tqdm
import os

from news_parsers import import_parsers



class NewsImporter:
    def __init__(self, output_file: str="news.json", workers: int=10):
        if not os.path.exists(output_file):
            with open(output_file, 'w', encoding='utf-8') as f:
                f.write("[]")
        self.output_file = output_file
        self.workers = workers
        self.parsers = import_parsers()
        self.tasks = queue.Queue()
        self.progress = queue.Queue()
        self.to_save = queue.Queue()
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
        while self.tasks.get():
            task = self.tasks.get()
            parser = self._get_parser(task["url"])
            if not parser:
                self.progress.put(1)
                continue
            try:
                data = parser.get_news(task["url"])
                if data.get("title"):
                    self.to_save.put({
                        "id": task["id"],
                        "title": data["title"],
                        "content": data["content"],
                        "date": task["published_at"],
                        "source": task["source"],
                        "category": data.get("category")
                    })
                self.progress.put(1)
            except Exception:
                self.progress.put(1)

    def _get_parser(self, url):
        for prefix, parser in self.parsers.items():
            if url.startswith(prefix):
                return parser
        return None

    def _monitor(self, total):
        batch = []
        with tqdm.tqdm(total=total, desc="Импорт", unit="запись") as pbar:
            while not self._done():
                self._process_progress(pbar)
                self._flush_batch(batch)

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
            if len(batch) >= 1000:
                with open(self.output_file, "r+", encoding="utf-8") as f:
                    try:
                        prev_news = json.load(f)
                    except (json.JSONDecodeError, FileNotFoundError):
                        prev_news = []
                with open(self.output_file, "w", encoding="utf-8") as f:
                    json.dump(prev_news + batch, f, ensure_ascii=False)
                batch.clear()
        except queue.Empty:
            pass

    def _done(self):
        return (all(not t.is_alive() for t in threading.enumerate() 
                    if t.name.startswith("Thread") and t.daemon) 
                and self.tasks.empty() and self.to_save.empty())



if __name__ == "__main__":
    importer = NewsImporter("news.json", workers=11)
    importer.run(os.path.join(
        os.path.dirname(__file__), "dbtest", "news_merged_20260624_125713.jsonl"))