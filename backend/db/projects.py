import sqlalchemy
import datetime
import uuid
from sqlalchemy import orm
from . import SqlAlchemyBase
from .json_mixin import JsonSerializableMixin


class Project(SqlAlchemyBase, JsonSerializableMixin):
    __tablename__ = "projects"

    id = sqlalchemy.Column(
        sqlalchemy.String, primary_key=True, unique=True,
        nullable=False, default=lambda: uuid.uuid4().hex)
    name = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    developer_id = sqlalchemy.Column(
        sqlalchemy.Integer, sqlalchemy.ForeignKey("developers.id", ondelete="SET NULL"))
    city_id = sqlalchemy.Column(sqlalchemy.Integer, sqlalchemy.ForeignKey(
        "cities.id", ondelete="SET NULL"))
    planned_rve_date = sqlalchemy.Column(sqlalchemy.Date)
    created_at = sqlalchemy.Column(sqlalchemy.DateTime, default=datetime.datetime.now, nullable=False)

    city = orm.relationship("City", back_populates="projects")
    developer = orm.relationship("Developer", back_populates="projects")
    impact_signals = orm.relationship(
        "ImpactSignal", back_populates="project", cascade="all, delete-orphan")


class City(SqlAlchemyBase, JsonSerializableMixin):
    __tablename__ = "cities"
    id = sqlalchemy.Column(sqlalchemy.Integer, primary_key=True, autoincrement=True)
    name = sqlalchemy.Column(sqlalchemy.String, nullable=False, unique=True)

    projects = orm.relationship("Project", back_populates="city")
    impact_signals = orm.relationship(
        "ImpactSignal", back_populates="city", cascade="all, delete-orphan")


class Developer(SqlAlchemyBase, JsonSerializableMixin):
    __tablename__ = "developers"
    id = sqlalchemy.Column(sqlalchemy.Integer, primary_key=True, autoincrement=True)
    name = sqlalchemy.Column(sqlalchemy.String, nullable=False, unique=True)

    projects = orm.relationship("Project", back_populates="developer")
    impact_signals = orm.relationship(
        "ImpactSignal", back_populates="developer", cascade="all, delete-orphan")