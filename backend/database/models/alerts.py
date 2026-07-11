from database.models.__meta__ import SQLBase
from sqlalchemy import orm
import sqlalchemy
import datetime
import uuid


class ImpactSignal(SQLBase):
    __tablename__ = "impact_signals"

    id = sqlalchemy.Column(
        sqlalchemy.String, primary_key=True, unique=True,
        nullable=False, default=lambda: uuid.uuid4().hex)
    risk_level = sqlalchemy.Column(sqlalchemy.Integer, nullable=False)
    risk_category = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    news_id = sqlalchemy.Column(
        sqlalchemy.String, sqlalchemy.ForeignKey(
            "news.id", ondelete="CASCADE"), nullable=False)
    city_id = sqlalchemy.Column(
        sqlalchemy.Integer, sqlalchemy.ForeignKey(
            "cities.id", ondelete="CASCADE"), nullable=False)
    developer_id = sqlalchemy.Column(
        sqlalchemy.Integer, sqlalchemy.ForeignKey(
            "developers.id", ondelete="CASCADE"), nullable=False)
    project_id = sqlalchemy.Column(
        sqlalchemy.String, sqlalchemy.ForeignKey(
            "projects.id", ondelete="CASCADE"), nullable=False)
    created_at = sqlalchemy.Column(
        sqlalchemy.DateTime, default=datetime.datetime.now, nullable=False)

    news = orm.relationship("News", back_populates="impact_signal", lazy="selectin")
    city = orm.relationship("City", back_populates="impact_signals", lazy="selectin")
    developer = orm.relationship("Developer", back_populates="impact_signals", lazy="selectin")
    project = orm.relationship("Project", back_populates="impact_signals", lazy="selectin")
    alert = orm.relationship(
        "Alert", back_populates="impact_signal", cascade="all, delete-orphan", lazy="selectin")


class Subscription(SQLBase):
    __tablename__ = "subscriptions"

    id = sqlalchemy.Column(sqlalchemy.Integer, primary_key=True, autoincrement=True)
    user_id = sqlalchemy.Column(
        sqlalchemy.Integer, sqlalchemy.ForeignKey("users.id", ondelete="CASCADE"))
    type = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    item_id = sqlalchemy.Column(sqlalchemy.Integer, nullable=False)

    user = orm.relationship("User", back_populates="subscriptions")
    alert = orm.relationship(
        "Alert", back_populates="subscription", cascade="all, delete-orphan", lazy="selectin")


class Alert(SQLBase):
    __tablename__ = "alerts"

    id = sqlalchemy.Column(sqlalchemy.Integer, primary_key=True, autoincrement=True)
    sub_id = sqlalchemy.Column(
        sqlalchemy.Integer, sqlalchemy.ForeignKey(
            "subscriptions.id", ondelete="CASCADE"), nullable=False)
    imsig_id = sqlalchemy.Column(
        sqlalchemy.String, sqlalchemy.ForeignKey(
            "impact_signals.id", ondelete="CASCADE"), nullable=False)
    created_at = sqlalchemy.Column(
        sqlalchemy.DateTime, default=datetime.datetime.now, nullable=False)

    impact_signal = orm.relationship("ImpactSignal", back_populates="alert", lazy="selectin")
    subscription = orm.relationship("Subscription", back_populates="alert", lazy="selectin")