"""API test fixtures: TestClient with authenticated session."""
import asyncio
import os
import subprocess
import sys
from datetime import datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


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


@pytest.fixture(scope="session")
def _init_app_db(_seed_data):
    import db
    db.init_db()


@pytest.fixture(scope="session")
def _session_id(_init_app_db):
    async def _create():
        engine = create_async_engine(_build_test_url())
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            result = await session.execute(
                text("SELECT id FROM users WHERE email = 'test@example.com'")
            )
            user = result.fetchone()
            sid = str(uuid4())
            expires_at = datetime.now() + timedelta(days=7)
            await session.execute(
                text(
                    "INSERT INTO user_sessions (session_id, user_id, expires_at)"
                    " VALUES (:sid, :uid, :exp)"
                    " ON CONFLICT (session_id) DO NOTHING"
                ),
                {"sid": sid, "uid": user.id, "exp": expires_at},
            )
            await session.commit()
        await engine.dispose()
        return sid

    loop = asyncio.new_event_loop()
    sid = loop.run_until_complete(_create())
    loop.close()
    return sid


@pytest.fixture(scope="session")
def app(_init_app_db):
    from app import app
    return app


@pytest.fixture
def client(app):
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture
def auth_client(app, _session_id):
    with TestClient(app, raise_server_exceptions=False) as c:
        c.cookies.set("sessionId", _session_id)
        yield c
