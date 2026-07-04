from sqlalchemy import orm
import sqlalchemy
import datetime
import uuid

from .db_session import SqlAlchemyBase, Session
from .json_mixin import JsonSerializableMixin


def import_projects(data: list, db_sess: Session):
    for row in data:
        project = Project()
        project.selection = row["selection"]
        project.risk = row["risk"]
        project.region = row["region"]
        project.id = row["id"]
        project.name = row["name"]
        project.city = row["city"]
        project.district = row.get("district")
        project.area = row.get("area")
        project.class_type = row["class_type"]
        project.developer = row["developer"]
        project.builder = row["builder"]
        date_str = row["planned_rve_date"]
        if isinstance(date_str, str):
            project.planned_rve_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        else:
            project.planned_rve_date = date_str
        project.implementation_stage = row["implementation_stage"]
        project.construction_stage = row["construction_stage"]
        project.schedule_status = row["schedule_status"]
        db_sess.add(project)
    db_sess.flush()

def export_projects(db_sess: Session) -> list:
    return [project.to_dict() for project in db_sess.query(Project).all()]


class Project(SqlAlchemyBase, JsonSerializableMixin):
    __tablename__ = "projects"

    selection = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    risk = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    region = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    id = sqlalchemy.Column(sqlalchemy.String, primary_key=True, unique=True,
                           nullable=False, default=lambda: uuid.uuid4().hex)
    name = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    city = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    district = sqlalchemy.Column(sqlalchemy.String)
    area = sqlalchemy.Column(sqlalchemy.String)
    class_type = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    developer = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    builder = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    planned_rve_date = sqlalchemy.Column(sqlalchemy.Date, nullable=False)
    implementation_stage = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    construction_stage = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    schedule_status = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    created_at = sqlalchemy.Column(sqlalchemy.DateTime, default=datetime.datetime.now, nullable=False)

    news = orm.relationship("News", back_populates="project", cascade="all, delete-orphan")