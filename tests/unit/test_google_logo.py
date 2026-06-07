from datetime import timedelta

import pytest

import google_logo


@pytest.fixture(autouse=True)
def _reset_cache(monkeypatch):
    monkeypatch.delenv("GOOGLE_LOGO_BUCKET", raising=False)
    google_logo._memory_cache["data"] = None
    google_logo._memory_cache["fetched_at"] = None
    yield
    google_logo._memory_cache["data"] = None
    google_logo._memory_cache["fetched_at"] = None


async def test_get_logo_fetches_then_serves_from_cache(monkeypatch):
    calls = {"n": 0}

    async def fake_fetch():
        calls["n"] += 1
        return b"LOGO"

    monkeypatch.setattr(google_logo, "_fetch_remote", fake_fetch)
    assert await google_logo.get_logo() == b"LOGO"
    assert await google_logo.get_logo() == b"LOGO"
    assert calls["n"] == 1


async def test_get_logo_returns_none_when_unavailable_and_uncached(monkeypatch):
    async def fake_fetch():
        return None

    monkeypatch.setattr(google_logo, "_fetch_remote", fake_fetch)
    assert await google_logo.get_logo() is None


async def test_get_logo_serves_stale_cache_when_fetch_fails(monkeypatch):
    google_logo._memory_cache["data"] = b"STALE"
    google_logo._memory_cache["fetched_at"] = google_logo._now() - timedelta(days=3)

    async def fake_fetch():
        return None

    monkeypatch.setattr(google_logo, "_fetch_remote", fake_fetch)
    assert await google_logo.get_logo() == b"STALE"


async def test_get_logo_refreshes_when_cache_expired(monkeypatch):
    google_logo._memory_cache["data"] = b"OLD"
    google_logo._memory_cache["fetched_at"] = google_logo._now() - timedelta(days=2)

    async def fake_fetch():
        return b"NEW"

    monkeypatch.setattr(google_logo, "_fetch_remote", fake_fetch)
    assert await google_logo.get_logo() == b"NEW"
