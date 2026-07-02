from sqlalchemy import orm
import sqlalchemy
import datetime
import uuid

from .db_session import SqlAlchemyBase
from .json_mixin import JsonSerializableMixin


class Project(SqlAlchemyBase, JsonSerializableMixin):
    __tablename__ = "projects"

    selection = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    risk = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    region = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    id = sqlalchemy.Column(
        sqlalchemy.String, primary_key=True, unique=True, nullable=False, default=lambda: uuid.uuid4().hex)
    name = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    city = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    district = sqlalchemy.Column(sqlalchemy.String, nullable=True)
    area = sqlalchemy.Column(sqlalchemy.String, nullable=True)
    class_type = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    developer = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    builder = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    planned_rve_date = sqlalchemy.Column(sqlalchemy.Date, nullable=False)
    implementation_stage = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    construction_stage = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    schedule_status = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    created_at = sqlalchemy.Column(sqlalchemy.DateTime, default=datetime.datetime.now, nullable=False)

    news = orm.relationship("News", back_populates="project", cascade="all, delete-orphan")