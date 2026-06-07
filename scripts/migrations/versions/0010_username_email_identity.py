from typing import Sequence, Union

from alembic import op

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE users ALTER COLUMN username TYPE VARCHAR(100)")
    op.execute("UPDATE users SET username = email WHERE username IS DISTINCT FROM email")


def downgrade() -> None:
    op.execute("ALTER TABLE users ALTER COLUMN username TYPE VARCHAR(50) USING LEFT(username, 50)")
