"""API tests for /api/about/stats endpoint."""


def test_about_stats_returns_correct_aggregates(auth_client):
    response = auth_client.get("/api/about/stats")
    assert response.status_code == 200
    data = response.json()
    assert "games_played" in data
    assert "unique_players" in data
    assert isinstance(data["games_played"], int)
    assert isinstance(data["unique_players"], int)
