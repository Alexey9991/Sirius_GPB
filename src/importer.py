from db import db_session
from db.__all_models import *
from db.data_transport import import_news, import_projects
import json, os, csv

DB_PATH = os.path.join(os.path.dirname(__file__), "dbtest")
db_session.global_init(os.path.join(DB_PATH, "db.sqlite3"))
db_sess = db_session.create_session()


with open(os.path.join(DB_PATH, "news.json"), "r", encoding="utf-8") as f:
    data = json.load(f)
import_news(data, db_sess)

with open(os.path.join(DB_PATH, "zhk_selected.csv"), "r", encoding="utf-8-sig") as f:
    data = list(csv.DictReader(f))
import_projects(data, db_sess)
db_sess.commit()