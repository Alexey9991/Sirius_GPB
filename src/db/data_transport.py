from .db_session import Session
from .__all_models import *
from datetime import datetime


def import_news(data: list, db_sess: Session):
    for news_data in data:
        news = News()
        news.project_id = news_data["project_id"]
        news.project_name = news_data["project_name"]
        news.developer = news_data["developer"]
        news.title = news_data["title"]
        news.content = news_data["content"]
        date_str = news_data["date"]
        if isinstance(date_str, str):
            news.date = datetime.strptime(date_str, "%Y-%m-%d").date()
        else:
            news.date = date_str
        news.source = news_data["source"]
        news.category = news_data["category"]
        news.sentiment = news_data["sentiment"]
        db_sess.add(news)
    db_sess.flush()

def export_news(db_sess: Session) -> list:
    return [news.to_dict() for news in db_sess.query(News).all()]


def import_projects(data: list, db_sess: Session):
    for row in data:
        project = Project()
        project.selection = row["selection"]
        project.risk = row["risk"]
        project.region = row["region"]
        project.id = row["id"]
        project.name = row["name"]
        project.city = row["city"]
        project.district = row.get("district")
        project.area = row.get("area")
        project.class_type = row["class_type"]
        project.developer = row["developer"]
        project.builder = row["builder"]
        date_str = row["planned_rve_date"]
        if isinstance(date_str, str):
            project.planned_rve_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        else:
            project.planned_rve_date = date_str
        project.implementation_stage = row["implementation_stage"]
        project.construction_stage = row["construction_stage"]
        project.schedule_status = row["schedule_status"]
        db_sess.add(project)
    db_sess.flush()

def export_projects(db_sess: Session) -> list:
    return [project.to_dict() for project in db_sess.query(Project).all()]