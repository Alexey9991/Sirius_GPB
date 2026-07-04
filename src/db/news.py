from sqlalchemy import orm
import sqlalchemy
import datetime
import uuid

from .db_session import SqlAlchemyBase, Session
from .json_mixin import JsonSerializableMixin


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


class News(SqlAlchemyBase, JsonSerializableMixin):
    __tablename__ = "news"

    id = sqlalchemy.Column(sqlalchemy.String, primary_key=True, unique=True,
                           nullable=False, default=lambda: uuid.uuid4().hex)
    project_id = sqlalchemy.Column(sqlalchemy.String, sqlalchemy.ForeignKey(
        "projects.id", ondelete="CASCADE"), index=True)
    project_name = sqlalchemy.Column(sqlalchemy.String)
    developer = sqlalchemy.Column(sqlalchemy.String)
    title = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    content = sqlalchemy.Column(sqlalchemy.Text, nullable=False)
    date = sqlalchemy.Column(sqlalchemy.Date, default=datetime.datetime.now, nullable=False)
    source = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    category = sqlalchemy.Column(sqlalchemy.String)
    sentiment = sqlalchemy.Column(sqlalchemy.String, default="neutral", nullable=False)
    created_at = sqlalchemy.Column(sqlalchemy.DateTime, default=datetime.datetime.now, nullable=False)

    project = orm.relationship("Project", back_populates="news")