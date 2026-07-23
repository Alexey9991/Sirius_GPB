from .__meta__ import SQLBase
from sqlalchemy import orm
import sqlalchemy as sql
from pgvector.sqlalchemy import Vector


class Chunk(SQLBase):
    __tablename__ = "chunks"

    news_id: orm.Mapped[str] = orm.mapped_column(
        sql.String, primary_key=True, nullable=False)
    chunk_id: orm.Mapped[int] = orm.mapped_column(
        sql.Integer, primary_key=True, nullable=False)
    url: orm.Mapped[str | None] = orm.mapped_column(sql.Text, nullable=True)
    text: orm.Mapped[str] = orm.mapped_column(sql.Text, nullable=False)
    embedding: orm.Mapped[Vector] = orm.mapped_column(
        Vector(1024), nullable=True)