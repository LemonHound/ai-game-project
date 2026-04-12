"""API integration tests for the about stats endpoint."""
import os

import about as about_module


def test_about_stats_returns_all_fields(auth_client):
    response = auth_client.get("/api/about/stats")
    assert response.status_code == 200
    data = response.json()
    required = [
        "games_played",
        "moves_analyzed",
        "registered_players",
        "unique_players",
        "ai_win_rate",
        "player_win_rate",
        "avg_moves_per_game",
        "days_running",
        "monthly_cost_usd",
    ]
    for field in required:
        assert field in data, f"Missing field: {field}"
    assert "training_moves" not in data


def test_about_stats_returns_correct_aggregates(auth_client):
    response = auth_client.get("/api/about/stats")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data["games_played"], int)
    assert isinstance(data["unique_players"], int)


def test_about_stats_monthly_cost(monkeypatch, auth_client):
    about_module._cache["data"] = None
    monkeypatch.setenv("MONTHLY_COST_ESTIMATE", "42")
    response = auth_client.get("/api/about/stats")
    assert response.status_code == 200
    data = response.json()
    assert data["monthly_cost_usd"] == 42
