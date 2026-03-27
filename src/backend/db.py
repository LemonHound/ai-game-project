import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

_engine = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def _build_url() -> str:
    host = os.getenv("DB_HOST", "")
    port = os.getenv("DB_PORT", "5432")
    name = os.getenv("DB_NAME", "")
    user = os.getenv("DB_USER", "")
    password = os.getenv("DB_PASSWORD", "")
    if host.startswith("/"):
        return f"postgresql+asyncpg://{user}:{password}@/{name}?host={host}"
    return f"postgresql+asyncpg://{user}:{password}@{host}:{port}/{name}"


def init_db() -> None:
    global _engine, _session_factory
    from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor

    _engine = create_async_engine(_build_url(), pool_size=5, max_overflow=10)
    SQLAlchemyInstrumentor().instrument(engine=_engine.sync_engine)
    _session_factory = async_sessionmaker(_engine, expire_on_commit=False)


async def close_db() -> None:
    global _engine
    if _engine:
        await _engine.dispose()
        _engine = None


@asynccontextmanager
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with _session_factory() as session:
        yield session


async def db_dependency() -> AsyncGenerator[AsyncSession, None]:
    async with _session_factory() as session:
        yield session
