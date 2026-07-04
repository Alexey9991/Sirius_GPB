from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class FavoriteRecord(Base):
    __tablename__ = "user_favorites"

    user_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AnalysisHistoryRecord(Base):
    __tablename__ = "analysis_history"
    __table_args__ = (
        Index("ix_analysis_history_user_analyzed_at", "user_id", "analyzed_at"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    project_id: Mapped[str | None] = mapped_column(String(128))
    project_name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    level: Mapped[str] = mapped_column(String(16), nullable=False)
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    model_version: Mapped[str] = mapped_column(String(100), nullable=False)
    analyzed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class RiskChangeRecord(Base):
    __tablename__ = "risk_changes"
    __table_args__ = (
        Index("ix_risk_changes_user_changed_at", "user_id", "changed_at"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    project_id: Mapped[str | None] = mapped_column(String(128))
    project_name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    previous_level: Mapped[str | None] = mapped_column(String(16))
    new_level: Mapped[str] = mapped_column(String(16), nullable=False)
    previous_score: Mapped[int | None] = mapped_column(Integer)
    new_score: Mapped[int] = mapped_column(Integer, nullable=False)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
