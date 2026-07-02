from sqlalchemy import orm
import sqlalchemy
import datetime

from .db_session import SqlAlchemyBase
from .json_mixin import JsonSerializableMixin


class News(SqlAlchemyBase, JsonSerializableMixin):
    __tablename__ = "news"

    id = sqlalchemy.Column(sqlalchemy.Integer, primary_key=True, autoincrement=True)
    project_id = sqlalchemy.Column(
        sqlalchemy.String, sqlalchemy.ForeignKey("projects.project_id", ondelete="CASCADE"),
        nullable=False, index=True)
    project_name = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    developer = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    title = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    content = sqlalchemy.Column(sqlalchemy.Text, nullable=False)
    date = sqlalchemy.Column(sqlalchemy.Date, nullable=False)
    source = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    category = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    sentiment = sqlalchemy.Column(sqlalchemy.String, nullable=False)
    created_at = sqlalchemy.Column(sqlalchemy.DateTime, default=datetime.datetime.now, nullable=False)

    project = orm.relationship("Project", back_populates="news")