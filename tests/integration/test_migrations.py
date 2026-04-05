"""Integration tests for Alembic migrations."""
import os
import subprocess
import sys

import pytest


@pytest.fixture(scope="module")
def _migration_env():
    return {
        **os.environ,
        "DB_HOST": os.environ["DB_HOST"],
        "DB_PORT": os.environ["DB_PORT"],
        "DB_NAME": os.environ["DB_NAME"],
        "DB_USER": os.environ["DB_USER"],
        "DB_PASSWORD": os.environ["DB_PASSWORD"],
    }


def test_migration_upgrade_downgrade_upgrade(_migration_env, _run_migrations):
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "downgrade", "-1"],
        cwd=root,
        env=_migration_env,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"Downgrade failed: {result.stderr}"

    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=root,
        env=_migration_env,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, f"Re-upgrade failed: {result.stderr}"
