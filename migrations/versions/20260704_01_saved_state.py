"""Add favorites, analysis history and risk changes.

Revision ID: 20260704_01
Revises:
Create Date: 2026-07-04
"""
from typing import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20260704_01"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_favorites",
        sa.Column("user_id", sa.String(length=128), nullable=False),
        sa.Column("project_id", sa.String(length=128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("user_id", "project_id"),
    )
    op.create_table(
        "analysis_history",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("user_id", sa.String(length=128), nullable=False),
        sa.Column("project_id", sa.String(length=128), nullable=True),
        sa.Column("project_name", sa.String(length=200), nullable=False),
        sa.Column("level", sa.String(length=16), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("model_version", sa.String(length=100), nullable=False),
        sa.Column("analyzed_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_analysis_history_user_id", "analysis_history", ["user_id"])
    op.create_index("ix_analysis_history_project_name", "analysis_history", ["project_name"])
    op.create_index(
        "ix_analysis_history_user_analyzed_at",
        "analysis_history",
        ["user_id", "analyzed_at"],
    )
    op.create_table(
        "risk_changes",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("user_id", sa.String(length=128), nullable=False),
        sa.Column("project_id", sa.String(length=128), nullable=True),
        sa.Column("project_name", sa.String(length=200), nullable=False),
        sa.Column("previous_level", sa.String(length=16), nullable=True),
        sa.Column("new_level", sa.String(length=16), nullable=False),
        sa.Column("previous_score", sa.Integer(), nullable=True),
        sa.Column("new_score", sa.Integer(), nullable=False),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_risk_changes_user_id", "risk_changes", ["user_id"])
    op.create_index("ix_risk_changes_project_name", "risk_changes", ["project_name"])
    op.create_index(
        "ix_risk_changes_user_changed_at",
        "risk_changes",
        ["user_id", "changed_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_risk_changes_user_changed_at", table_name="risk_changes")
    op.drop_index("ix_risk_changes_project_name", table_name="risk_changes")
    op.drop_index("ix_risk_changes_user_id", table_name="risk_changes")
    op.drop_table("risk_changes")
    op.drop_index("ix_analysis_history_user_analyzed_at", table_name="analysis_history")
    op.drop_index("ix_analysis_history_project_name", table_name="analysis_history")
    op.drop_index("ix_analysis_history_user_id", table_name="analysis_history")
    op.drop_table("analysis_history")
    op.drop_table("user_favorites")
