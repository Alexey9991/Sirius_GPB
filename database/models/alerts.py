from .__meta__ import SQLBase
from sqlalchemy import orm
import sqlalchemy as sql
import datetime
import uuid


class ImpactSignal(SQLBase):
    __tablename__ = "impact_signals"

    id = sql.Column(
        sql.String, primary_key=True, unique=True,
        nullable=False, default=lambda: uuid.uuid4().hex)
    risk_level = sql.Column(sql.Integer, nullable=False)
    risk_category = sql.Column(sql.String, nullable=False)
    news_id = sql.Column(
        sql.String, sql.ForeignKey(
            "news.id", ondelete="CASCADE"), nullable=False)
    city_id = sql.Column(
        sql.Integer, sql.ForeignKey(
            "cities.id", ondelete="CASCADE"), nullable=False)
    developer_id = sql.Column(
        sql.Integer, sql.ForeignKey(
            "developers.id", ondelete="CASCADE"), nullable=False)
    project_id = sql.Column(
        sql.String, sql.ForeignKey(
            "projects.id", ondelete="CASCADE"), nullable=False)
    created_at = sql.Column(
        sql.DateTime, default=datetime.datetime.now, nullable=False)

    news = orm.relationship("News", back_populates="impact_signal", lazy="selectin")
    city = orm.relationship("City", back_populates="impact_signals", lazy="selectin")
    developer = orm.relationship("Developer", back_populates="impact_signals", lazy="selectin")
    project = orm.relationship("Project", back_populates="impact_signals", lazy="selectin")
    alert = orm.relationship(
        "Alert", back_populates="impact_signal", cascade="all, delete-orphan", lazy="selectin")


class Subscription(SQLBase):
    __tablename__ = "subscriptions"

    id = sql.Column(sql.Integer, primary_key=True, autoincrement=True)
    user_id = sql.Column(
        sql.Integer, sql.ForeignKey("users.id", ondelete="CASCADE"))
    type = sql.Column(sql.String, nullable=False)
    item_id = sql.Column(sql.String, nullable=False)

    user = orm.relationship("User", back_populates="subscriptions")
    alert = orm.relationship(
        "Alert", back_populates="subscription", cascade="all, delete-orphan", lazy="selectin")


class Alert(SQLBase):
    __tablename__ = "alerts"

    id = sql.Column(sql.Integer, primary_key=True, autoincrement=True)
    sub_id = sql.Column(
        sql.Integer, sql.ForeignKey(
            "subscriptions.id", ondelete="CASCADE"), nullable=False)
    imsig_id = sql.Column(
        sql.String, sql.ForeignKey(
            "impact_signals.id", ondelete="CASCADE"), nullable=False)
    created_at = sql.Column(
        sql.DateTime, default=datetime.datetime.now, nullable=False)

    impact_signal = orm.relationship("ImpactSignal", back_populates="alert", lazy="selectin")
    subscription = orm.relationship("Subscription", back_populates="alert", lazy="selectin")
