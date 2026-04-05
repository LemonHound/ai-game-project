"""Integration test fixtures: DB engine, migrations, session, seed data, cache clearing."""
import os
import subprocess
import sys

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


def _build_test_url():
    host = os.environ["DB_HOST"]
    port = os.environ["DB_PORT"]
    name = os.environ["DB_NAME"]
    user = os.environ["DB_USER"]
    password = os.environ["DB_PASSWORD"]
    return f"postgresql+asyncpg://{user}:{password}@{host}:{port}/{name}"


@pytest.fixture(scope="session")
def _run_migrations():
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=root,
        env={**os.environ},
        check=True,
    )


@pytest.fixture(scope="session")
def _seed_data(_run_migrations):
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
    subprocess.run(
        [sys.executable, "scripts/seed_test_data.py"],
        cwd=root,
        env={**os.environ},
        check=True,
    )


@pytest.fixture(scope="session", autouse=True)
def _init_app_db(_seed_data):
    import db
    db.init_db()


@pytest_asyncio.fixture
async def seeded_db():
    engine = create_async_engine(_build_test_url(), pool_size=2, max_overflow=0)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session
    await engine.dispose()


@pytest.fixture(autouse=True)
def clear_stats_cache():
    yield
    os.environ["ENVIRONMENT"] = "test"
    from stats import clear_caches
    clear_caches()
