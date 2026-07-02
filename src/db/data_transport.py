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