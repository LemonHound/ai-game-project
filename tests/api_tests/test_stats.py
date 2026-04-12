"""API tests for stats and leaderboard endpoints."""


def test_stats_returns_values(auth_client):
    response = auth_client.get("/api/stats/me")
    assert response.status_code == 200
    data = response.json()
    assert "per_game" in data


def test_leaderboard_pagination(auth_client):
    response = auth_client.get(
        "/api/leaderboard/games_played",
        params={"game_type": "tic_tac_toe", "page": 1, "per_page": 10},
    )
    assert response.status_code == 200
    data = response.json()
    assert "entries" in data
    assert "page" in data
    assert data["page"] == 1


def test_get_leaderboard_returns_entries(auth_client):
    response = auth_client.get(
        "/api/leaderboard/games_played",
        params={"game_type": "tic_tac_toe", "page": 1, "per_page": 10},
    )
    assert response.status_code == 200
    data = response.json()
    assert "entries" in data
    assert isinstance(data["entries"], list)
