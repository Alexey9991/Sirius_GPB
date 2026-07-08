import sqlalchemy
import datetime
import uuid
from sqlalchemy import orm
from . import SqlAlchemyBase
from .json_mixin import JsonSerializableMixin


class ImpactSignal(SqlAlchemyBase, JsonSerializableMixin):
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

    news = orm.relationship("News", back_populates="impact_signals")
    city = orm.relationship("City", back_populates="impact_signals")
    developer = orm.relationship("Developer", back_populates="impact_signals")
    project = orm.relationship("Project", back_populates="impact_signals")
    alerts = orm.relationship(
        "Alert", back_populates="impact_signal", cascade="all, delete-orphan")


class Subscription(SqlAlchemyBase, JsonSerializableMixin):
    __tablename__ = "subscriptions"

    id = sqlalchemy.Column(sqlalchemy.Integer, primary_key=True, autoincrement=True)
    user_id = sqlalchemy.Column(
        sqlalchemy.Integer, sqlalchemy.ForeignKey("users.id", ondelete="CASCADE"))
    type = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    item_id = sqlalchemy.Column(sqlalchemy.Integer, nullable=False)

    user = orm.relationship("User", back_populates="subscriptions")
    alerts = orm.relationship(
        "Alert", back_populates="subscription", cascade="all, delete-orphan")


class Alert(SqlAlchemyBase, JsonSerializableMixin):
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

    impact_signal = orm.relationship("ImpactSignal", back_populates="alerts")
    subscription = orm.relationship("Subscription", back_populates="alerts")