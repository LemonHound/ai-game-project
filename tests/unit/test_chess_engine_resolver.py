import asyncio
import os

import games


def test_strategy_for_gcs_path_loads_fixture_and_caches(monkeypatch):
    fixtures = os.path.abspath("tests/fixtures")
    monkeypatch.setattr(games, "_CHESS_WEIGHTS_ROOT", fixtures)
    games._chess_engine_cache.clear()
    first = games._strategy_for_gcs_path("chess_model_tiny")
    second = games._strategy_for_gcs_path("chess_model_tiny")
    assert first is second
    assert hasattr(first, "generate_move")


def test_resolve_chess_strategy_no_engine_returns_scripted():
    result = asyncio.run(games._resolve_chess_strategy(None, None))
    assert result is games._chess_strategy


def test_resolve_chess_strategy_unknown_engine_returns_scripted(monkeypatch):
    async def fake_get_engine(db, engine_id):
        return None

    monkeypatch.setattr(games.model_registry, "get_engine", fake_get_engine)
    result = asyncio.run(games._resolve_chess_strategy(object(), 999))
    assert result is games._chess_strategy


def test_resolve_chess_strategy_loads_model_when_artifact_present(monkeypatch):
    fixtures = os.path.abspath("tests/fixtures")
    monkeypatch.setattr(games, "_CHESS_WEIGHTS_ROOT", fixtures)
    games._chess_engine_cache.clear()

    async def fake_get_engine(db, engine_id):
        return {"gcs_path": "chess_model_tiny"}

    monkeypatch.setattr(games.model_registry, "get_engine", fake_get_engine)
    result = asyncio.run(games._resolve_chess_strategy(object(), 1))
    assert result is not games._chess_strategy
    assert result is games._strategy_for_gcs_path("chess_model_tiny")
    assert hasattr(result, "generate_move")


def test_resolve_chess_strategy_falls_back_when_artifact_missing(monkeypatch):
    fixtures = os.path.abspath("tests/fixtures")
    monkeypatch.setattr(games, "_CHESS_WEIGHTS_ROOT", fixtures)
    games._chess_engine_cache.clear()

    async def fake_get_engine(db, engine_id):
        return {"gcs_path": "chess/does_not_exist/9.9.9"}

    monkeypatch.setattr(games.model_registry, "get_engine", fake_get_engine)
    result = asyncio.run(games._resolve_chess_strategy(object(), 1))
    assert result is games._chess_strategy
