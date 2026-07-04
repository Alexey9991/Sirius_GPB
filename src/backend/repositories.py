from __future__ import annotations

import uuid
from typing import Protocol

from sqlalchemy import delete, desc, select

from ..schemas import AnalysisHistoryItem, AnalysisResponse, RiskChange
from .database import Database
from .models import AnalysisHistoryRecord, FavoriteRecord, RiskChangeRecord


class SavedStateRepository(Protocol):
    def list_favorite_ids(self, user_id: str) -> list[str]: ...
    def add_favorite(self, user_id: str, project_id: str) -> None: ...
    def remove_favorite(self, user_id: str, project_id: str) -> None: ...
    def record_analysis(self, user_id: str, analysis: AnalysisResponse) -> None: ...
    def list_analysis_history(self, user_id: str, limit: int) -> list[AnalysisHistoryItem]: ...
    def list_risk_changes(self, user_id: str, limit: int) -> list[RiskChange]: ...


class SqlAlchemySavedStateRepository:
    """Persistence adapter replaceable without changing routes or services."""

    def __init__(self, database: Database):
        self.database = database

    def list_favorite_ids(self, user_id: str) -> list[str]:
        with self.database.session() as session:
            statement = (
                select(FavoriteRecord.project_id)
                .where(FavoriteRecord.user_id == user_id)
                .order_by(desc(FavoriteRecord.created_at))
            )
            return list(session.scalars(statement))

    def add_favorite(self, user_id: str, project_id: str) -> None:
        with self.database.session() as session:
            existing = session.get(FavoriteRecord, (user_id, project_id))
            if existing is None:
                session.add(FavoriteRecord(user_id=user_id, project_id=project_id))

    def remove_favorite(self, user_id: str, project_id: str) -> None:
        with self.database.session() as session:
            session.execute(
                delete(FavoriteRecord).where(
                    FavoriteRecord.user_id == user_id,
                    FavoriteRecord.project_id == project_id,
                )
            )

    def record_analysis(self, user_id: str, analysis: AnalysisResponse) -> None:
        with self.database.session() as session:
            previous = session.scalars(
                select(AnalysisHistoryRecord)
                .where(
                    AnalysisHistoryRecord.user_id == user_id,
                    AnalysisHistoryRecord.project_name == analysis.project_name,
                )
                .order_by(desc(AnalysisHistoryRecord.analyzed_at))
                .limit(1)
            ).first()
            session.add(
                AnalysisHistoryRecord(
                    id=uuid.uuid4().hex,
                    user_id=user_id,
                    project_id=analysis.project_id,
                    project_name=analysis.project_name,
                    level=analysis.level.value,
                    score=analysis.score,
                    summary=analysis.summary,
                    model_version=analysis.model_version,
                    analyzed_at=analysis.analyzed_at,
                )
            )
            if previous is None or previous.level != analysis.level.value or previous.score != analysis.score:
                session.add(
                    RiskChangeRecord(
                        id=uuid.uuid4().hex,
                        user_id=user_id,
                        project_id=analysis.project_id,
                        project_name=analysis.project_name,
                        previous_level=previous.level if previous else None,
                        new_level=analysis.level.value,
                        previous_score=previous.score if previous else None,
                        new_score=analysis.score,
                        changed_at=analysis.analyzed_at,
                    )
                )

    def list_analysis_history(self, user_id: str, limit: int) -> list[AnalysisHistoryItem]:
        with self.database.session() as session:
            rows = session.scalars(
                select(AnalysisHistoryRecord)
                .where(AnalysisHistoryRecord.user_id == user_id)
                .order_by(desc(AnalysisHistoryRecord.analyzed_at))
                .limit(limit)
            ).all()
            return [
                AnalysisHistoryItem(
                    id=row.id,
                    project_id=row.project_id,
                    project_name=row.project_name,
                    level=row.level,
                    score=row.score,
                    summary=row.summary,
                    model_version=row.model_version,
                    analyzed_at=row.analyzed_at,
                )
                for row in rows
            ]

    def list_risk_changes(self, user_id: str, limit: int) -> list[RiskChange]:
        with self.database.session() as session:
            rows = session.scalars(
                select(RiskChangeRecord)
                .where(RiskChangeRecord.user_id == user_id)
                .order_by(desc(RiskChangeRecord.changed_at))
                .limit(limit)
            ).all()
            return [
                RiskChange(
                    id=row.id,
                    project_id=row.project_id,
                    project_name=row.project_name,
                    previous_level=row.previous_level,
                    new_level=row.new_level,
                    previous_score=row.previous_score,
                    new_score=row.new_score,
                    changed_at=row.changed_at,
                )
                for row in rows
            ]
