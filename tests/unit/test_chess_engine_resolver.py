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
