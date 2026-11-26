"""Baseline schema marker for existing ShasthoGrid databases.

Revision ID: 0001_baseline_schema
Revises:
Create Date: 2026-11-26
"""

from __future__ import annotations

revision = "0001_baseline_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Existing tables are created via SQLAlchemy metadata / init_db baseline.
    pass


def downgrade() -> None:
    pass
