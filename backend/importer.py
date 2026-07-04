from db import db_session
from db.__all_models import *
from news_parsers import import_parsers
from sqlalchemy.orm import Session
import json, os, csv, tqdm, queue, threading
from datetime import datetime


DB_PATH = os.path.join(os.path.dirname(__file__), "dbtest")
db_session.global_init(os.path.join(DB_PATH, "db.sqlite3"))
db_sess = db_session.create_session()
db_engine = db_sess.get_bind()
parsers = import_parsers()
num_workers = 10


with open(os.path.join(DB_PATH, "news.json"), "r", encoding="utf-8") as f:
    data = json.load(f)
import_news(data, db_sess)
db_sess.commit()


filepath = os.path.join(DB_PATH, "news_merged_20260624_125713.jsonl")
with open(filepath, 'r', encoding='utf-8') as f:
    total_lines = sum(1 for _ in f)

tasks_queue = queue.Queue()
progress_queue = queue.Queue()
save_queue = queue.Queue()
stop_event = threading.Event()

def reader():
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            if stop_event.is_set():
                break
            nowost = json.loads(line)
            tasks_queue.put(nowost)
    for _ in range(num_workers):
        tasks_queue.put(None)

def worker():
    sess = Session(db_engine)
    while True:
        task = tasks_queue.get()
        if task is None:
            break
        nowost = task
        parser = next((p for prefix, p in parsers.items()
                       if nowost["url"].startswith(prefix)), None)
        if not parser:
            progress_queue.put(1)
            continue
        try:
            got = parser.get_news(nowost["url"])
            existing = sess.query(News).filter(News.id == nowost["id"]).first()
            if not existing and got.get("title"):
                news = News()
                news.id = nowost["id"]
                news.title = got["title"]
                news.content = got["content"]
                news.date = datetime.strptime(nowost["published_at"], "%Y-%m-%d").date()
                news.source = nowost["source"]
                news.category = got["category"]
                save_queue.put(news)
            progress_queue.put(1)
        except Exception as e:
            print(f"Ошибка в воркере: {e}")
            progress_queue.put(1)
            continue
    sess.close()

reader_thread = threading.Thread(target=reader, daemon=True)
reader_thread.start()
workers = []
for _ in range(num_workers):
    t = threading.Thread(target=worker, daemon=True)
    t.start()
    workers.append(t)
processed = 0
save_batch = []
sess_main = Session(db_engine)

with tqdm.tqdm(total=total_lines, desc="Импорт новостей", unit="запись") as pbar:
    while True:
        try:
            prog = progress_queue.get(timeout=0.1)
            if prog == 1:
                processed += 1
                pbar.update(1)
        except queue.Empty:
            pass
        try:
            news = save_queue.get_nowait()
            save_batch.append(news)
            if len(save_batch) >= 100:
                for n in save_batch:
                    sess_main.merge(n)
                sess_main.commit()
                save_batch.clear()
        except queue.Empty:
            pass

        if all(not t.is_alive() for t in workers) and tasks_queue.empty() and save_queue.empty():
            break

sess_main.close()
reader_thread.join()
for t in workers:
    t.join()


with open(os.path.join(DB_PATH, "zhk_selected.csv"), "r", encoding="utf-8-sig") as f:
    data = list(csv.DictReader(f))
import_projects(data, db_sess)
db_sess.commit()