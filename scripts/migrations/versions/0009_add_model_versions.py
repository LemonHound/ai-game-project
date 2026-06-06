"""Add model_versions registry table

Tracks published model artifacts per game and difficulty, each tied to a GCS
path and a semantic version, with an active flag. The serving layer selects the
latest active version for the difficulty a player picks, and offers any
difficulty that has at least one active version. Seeds the current chess
"untrained" 0.1.0 artifact as the active version.

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-06
"""

from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE model_versions (
            id BIGSERIAL PRIMARY KEY,
            game TEXT NOT NULL,
            difficulty TEXT NOT NULL,
            version TEXT NOT NULL,
            gcs_path TEXT NOT NULL,
            active BOOLEAN NOT NULL DEFAULT false,
            class_count INTEGER,
            source_commit TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (game, difficulty, version)
        )
        """
    )
    op.execute(
        """
        INSERT INTO model_versions
            (game, difficulty, version, gcs_path, active, class_count, source_commit)
        VALUES
            ('chess', 'untrained', '0.1.0', 'chess/untrained/0.1.0', true, 1816, '5e38170')
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE model_versions")
