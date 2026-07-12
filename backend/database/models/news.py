from database.models.__meta__ import SQLBase
from sqlalchemy import orm
import sqlalchemy as sql
import datetime
import uuid


class ParseNews(SQLBase):
    __tablename__ = "parse_news"

    id = sql.Column(
        sql.String, primary_key=True, unique=True,
        nullable=False, default=lambda: uuid.uuid4().hex)
    url = sql.Column(sql.String, nullable=False)
    is_valid = sql.Column(sql.Boolean)
    created_at = sql.Column(
        sql.DateTime, default=datetime.datetime.now, nullable=False)

    news = orm.relationship(
        "News", back_populates="parse_news", uselist=False,
        cascade="all, delete-orphan", lazy="selectin")


class News(SQLBase):
    __tablename__ = "news"

    id = sql.Column(
        sql.String, sql.ForeignKey("parse_news.id", ondelete="CASCADE"),
        primary_key=True, unique=True, nullable=False)
    title = sql.Column(sql.String, nullable=False)
    content = sql.Column(sql.Text, nullable=False)
    date = sql.Column(sql.Date, default=datetime.datetime.now)
    source = sql.Column(sql.String)
    category = sql.Column(sql.String)
    created_at = sql.Column(
        sql.DateTime, default=datetime.datetime.now, nullable=False)

    parse_news = orm.relationship(
        "ParseNews", back_populates="news", uselist=False, lazy="selectin")
    impact_signal = orm.relationship(
        "ImpactSignal", back_populates="news",
        cascade="all, delete-orphan", lazy="selectin")