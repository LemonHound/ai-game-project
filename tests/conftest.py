"""Root conftest: DB session fixture, TestClient fixture, cache-clearing fixture."""
import asyncio
import os
import subprocess
import sys

import pytest

os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("DB_HOST", "localhost")
os.environ.setdefault("DB_PORT", "5433")
os.environ.setdefault("DB_NAME", "test_db")
os.environ.setdefault("DB_USER", "test")
os.environ.setdefault("DB_PASSWORD", "test")


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()
