from .__meta__ import SQLBase
from sqlalchemy import orm
import sqlalchemy as sql
import datetime
import uuid


class Project(SQLBase):
    __tablename__ = "projects"

    id = sql.Column(
        sql.String, primary_key=True, unique=True,
        nullable=False, default=lambda: uuid.uuid4().hex)
    name = sql.Column(sql.String, nullable=False)
    developer_id = sql.Column(
        sql.Integer, sql.ForeignKey("developers.id", ondelete="SET NULL"))
    city_id = sql.Column(sql.Integer, sql.ForeignKey(
        "cities.id", ondelete="SET NULL"))
    created_at = sql.Column(sql.DateTime, default=datetime.datetime.now, nullable=False)

    city = orm.relationship("City", back_populates="projects", lazy="selectin")
    developer = orm.relationship("Developer", back_populates="projects", lazy="selectin")
    impact_signals = orm.relationship("ImpactSignal", back_populates="project", cascade="all, delete-orphan")


class City(SQLBase):
    __tablename__ = "cities"
    id = sql.Column(sql.Integer, primary_key=True, autoincrement=True)
    name = sql.Column(sql.String, nullable=False, unique=True)

    projects = orm.relationship("Project", back_populates="city")
    impact_signals = orm.relationship("ImpactSignal", back_populates="city", cascade="all, delete-orphan")


class Developer(SQLBase):
    __tablename__ = "developers"
    id = sql.Column(sql.Integer, primary_key=True, autoincrement=True)
    name = sql.Column(sql.String, nullable=False, unique=True)

    projects = orm.relationship("Project", back_populates="developer")
    impact_signals = orm.relationship("ImpactSignal", back_populates="developer", cascade="all, delete-orphan")