from sqlalchemy import orm
import sqlalchemy
import datetime
import uuid

from .db_session import SqlAlchemyBase
from .json_mixin import JsonSerializableMixin


class News(SqlAlchemyBase, JsonSerializableMixin):
    __tablename__ = "news"

    id = sqlalchemy.Column(sqlalchemy.String, primary_key=True, unique=True,
                           nullable=False, default=lambda: uuid.uuid4().hex)
    project_id = sqlalchemy.Column(sqlalchemy.String, sqlalchemy.ForeignKey(
        "projects.id", ondelete="CASCADE"), nullable=True, index=True)
    project_name = sqlalchemy.Column(sqlalchemy.String, nullable=True)
    developer = sqlalchemy.Column(sqlalchemy.String, nullable=True)
    title = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    content = sqlalchemy.Column(sqlalchemy.Text, nullable=False)
    date = sqlalchemy.Column(sqlalchemy.Date, default=datetime.datetime.now, nullable=False)
    source = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    category = sqlalchemy.Column(sqlalchemy.String, nullable=True)
    sentiment = sqlalchemy.Column(sqlalchemy.String, default="neutral", nullable=False)
    created_at = sqlalchemy.Column(sqlalchemy.DateTime, default=datetime.datetime.now, nullable=False)

    project = orm.relationship("Project", back_populates="news")