from database.models.__meta__ import SQLBase
from sqlalchemy import orm
import sqlalchemy
import datetime
import uuid


class Project(SQLBase):
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

    city = orm.relationship("City", back_populates="projects", lazy="selectin")
    developer = orm.relationship("Developer", back_populates="projects", lazy="selectin")
    impact_signals = orm.relationship(
        "ImpactSignal", back_populates="project", cascade="all, delete-orphan", lazy="selectin")


class City(SQLBase):
    __tablename__ = "cities"
    id = sqlalchemy.Column(sqlalchemy.Integer, primary_key=True, autoincrement=True)
    name = sqlalchemy.Column(sqlalchemy.String, nullable=False, unique=True)

    projects = orm.relationship("Project", back_populates="city", lazy="selectin")
    impact_signals = orm.relationship(
        "ImpactSignal", back_populates="city", cascade="all, delete-orphan", lazy="selectin")


class Developer(SQLBase):
    __tablename__ = "developers"
    id = sqlalchemy.Column(sqlalchemy.Integer, primary_key=True, autoincrement=True)
    name = sqlalchemy.Column(sqlalchemy.String, nullable=False, unique=True)

    projects = orm.relationship("Project", back_populates="developer", lazy="selectin")
    impact_signals = orm.relationship(
        "ImpactSignal", back_populates="developer", cascade="all, delete-orphan", lazy="selectin")