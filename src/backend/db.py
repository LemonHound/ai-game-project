"""Database engine initialisation, session factory, and dependency helpers."""
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
    """Initialize the async SQLAlchemy engine and session factory.

    Reads connection parameters from environment variables (DB_HOST, DB_PORT, DB_NAME,
    DB_USER, DB_PASSWORD). Instruments the engine with OpenTelemetry SQLAlchemy
    instrumentation. Called once during application lifespan startup.
    """
    global _engine, _session_factory
    from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor

    _engine = create_async_engine(_build_url(), pool_size=5, max_overflow=10)
    SQLAlchemyInstrumentor().instrument(engine=_engine.sync_engine)
    _session_factory = async_sessionmaker(_engine, expire_on_commit=False)


async def close_db() -> None:
    """Dispose the async SQLAlchemy engine and release all pooled connections.

    Called during application lifespan shutdown. Safe to call if init_db was never
    successfully completed (no-op when _engine is None).
    """
    global _engine
    if _engine:
        await _engine.dispose()
        _engine = None


@asynccontextmanager
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Yield an AsyncSession as a context manager for use outside of FastAPI routes.

    Used by AuthService and other non-route callers that need a DB session directly.

    Yields:
        AsyncSession: An active SQLAlchemy async session.
    """
    async with _session_factory() as session:
        yield session


async def db_dependency() -> AsyncGenerator[AsyncSession, None]:
    """Yield a database session as a dependency for each incoming request.

    Used via Depends(db_dependency) in route handlers. The session is automatically
    closed when the request completes.

    Yields:
        AsyncSession: An active SQLAlchemy async session.
    """
    async with _session_factory() as session:
        yield session
