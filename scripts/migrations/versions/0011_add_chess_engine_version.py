from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE chess_games "
        "ADD COLUMN engine_version_id BIGINT REFERENCES model_versions(id)"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE chess_games DROP COLUMN engine_version_id")
