import importlib
import os

import pytest


def reload_games(monkeypatch, env: dict):
    for key, val in env.items():
        monkeypatch.setenv(key, val)
    for key in list(os.environ):
        if key not in env and key in ("GAME_SERVER_MIN_EVENT_INTERVAL_MS", "ENVIRONMENT"):
            monkeypatch.delenv(key, raising=False)
    import games as _games
    importlib.reload(_games)
    return _games


def reload_base(monkeypatch, env: dict):
    for key, val in env.items():
        monkeypatch.setenv(key, val)
    for key in list(os.environ):
        if key not in env and key in ("GAME_SERVER_MIN_EVENT_INTERVAL_MS", "ENVIRONMENT"):
            monkeypatch.delenv(key, raising=False)
    import game_engine.base as _base
    importlib.reload(_base)
    return _base


def test_delay_uses_env_var(monkeypatch):
    g = reload_games(monkeypatch, {"GAME_SERVER_MIN_EVENT_INTERVAL_MS": "1000", "ENVIRONMENT": "development"})
    assert g._delay() == pytest.approx(1.0)


def test_delay_uses_default_when_unset(monkeypatch):
    monkeypatch.delenv("GAME_SERVER_MIN_EVENT_INTERVAL_MS", raising=False)
    g = reload_games(monkeypatch, {"ENVIRONMENT": "development"})
    assert g._delay() == pytest.approx(2.5)


def test_delay_near_zero_in_test_env(monkeypatch):
    g = reload_games(monkeypatch, {"ENVIRONMENT": "test", "GAME_SERVER_MIN_EVENT_INTERVAL_MS": "9999"})
    assert g._delay() <= 0.05


def test_status_broadcaster_min_interval(monkeypatch):
    b = reload_base(monkeypatch, {"GAME_SERVER_MIN_EVENT_INTERVAL_MS": "2000", "ENVIRONMENT": "development"})
    assert b.StatusBroadcaster.MIN_INTERVAL == pytest.approx(2.0)


def test_status_broadcaster_test_env_override(monkeypatch):
    b = reload_base(monkeypatch, {"GAME_SERVER_MIN_EVENT_INTERVAL_MS": "5000", "ENVIRONMENT": "test"})
    assert b.StatusBroadcaster.MIN_INTERVAL <= 0.05
