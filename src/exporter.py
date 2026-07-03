from db import db_session
from db.__all_models import *
from db.data_transport import export_news, export_projects
import json, os

DB_PATH = os.path.join(os.path.dirname(__file__), "dbtest")
db_session.global_init(os.path.join(DB_PATH, "db.sqlite3"))
db_sess = db_session.create_session()


news = export_news(db_sess)
with open(os.path.join(DB_PATH, "news_exp.json"), "w", encoding="utf-8") as f:
    json.dump(news, f, ensure_ascii=False)

projects = export_projects(db_sess)
with open(os.path.join(DB_PATH, "projects_exp.json"), "w", encoding="utf-8") as f:
    json.dump(projects, f, ensure_ascii=False)