from sqlalchemy import orm
import sqlalchemy
import datetime
import uuid

from . import SqlAlchemyBase
from .json_mixin import JsonSerializableMixin


class ParseNews(SqlAlchemyBase, JsonSerializableMixin):
    __tablename__ = "parse_news"

    id = sqlalchemy.Column(
        sqlalchemy.String, primary_key=True, unique=True,
        nullable=False, default=lambda: uuid.uuid4().hex)
    url = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    is_valid = sqlalchemy.Column(sqlalchemy.Boolean)
    created_at = sqlalchemy.Column(
        sqlalchemy.DateTime, default=datetime.datetime.now, nullable=False)

    news = orm.relationship(
        "News", back_populates="parse_news",
        cascade="all, delete-orphan", uselist=False)
    impact_signals = orm.relationship(
        "ImpactSignal", back_populates="news", cascade="all, delete-orphan")


class News(SqlAlchemyBase, JsonSerializableMixin):
    __tablename__ = "news"

    id = sqlalchemy.Column(
        sqlalchemy.String, sqlalchemy.ForeignKey("parse_news.id", ondelete="CASCADE"),
        primary_key=True, unique=True, nullable=False)
    title = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    content = sqlalchemy.Column(sqlalchemy.Text, nullable=False)
    date = sqlalchemy.Column(sqlalchemy.Date, default=datetime.datetime.now)
    source = sqlalchemy.Column(sqlalchemy.String)
    category = sqlalchemy.Column(sqlalchemy.String)
    created_at = sqlalchemy.Column(
        sqlalchemy.DateTime, default=datetime.datetime.now, nullable=False)

    parse_news = orm.relationship("ParseNews", back_populates="news", uselist=False)