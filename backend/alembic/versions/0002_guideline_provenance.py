"""Add guideline provenance columns to aware_guidelines.

Revision ID: 0002_guideline_provenance
Revises: 0001_baseline_schema
Create Date: 2026-11-26
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0002_guideline_provenance"
down_revision = "0001_baseline_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        sa.text(
            "ALTER TABLE aware_guidelines "
            "ADD COLUMN IF NOT EXISTS source_document VARCHAR(160) NOT NULL DEFAULT 'WHO AWaRe Antibiotic Book (2022) & Bangladesh DGHS STG'"
        )
    )
    op.execute(
        sa.text(
            "ALTER TABLE aware_guidelines "
            "ADD COLUMN IF NOT EXISTS rule_version VARCHAR(32) NOT NULL DEFAULT '2026.1-demo'"
        )
    )
    op.execute(
        sa.text(
            "ALTER TABLE aware_guidelines "
            "ADD COLUMN IF NOT EXISTS effective_date VARCHAR(16) NOT NULL DEFAULT '2026-01-01'"
        )
    )
    op.execute(
        sa.text(
            "ALTER TABLE aware_guidelines "
            "ADD COLUMN IF NOT EXISTS review_status VARCHAR(32) NOT NULL DEFAULT 'PENDING_CLINICAL_REVIEW'"
        )
    )


def downgrade() -> None:
    op.drop_column("aware_guidelines", "review_status")
    op.drop_column("aware_guidelines", "effective_date")
    op.drop_column("aware_guidelines", "rule_version")
    op.drop_column("aware_guidelines", "source_document")
