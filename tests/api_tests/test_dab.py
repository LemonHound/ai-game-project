"""API tests for Dots and Boxes endpoints."""


def test_dab_newgame_returns_empty_grid(auth_client):
    response = auth_client.post(
        "/api/game/dots-and-boxes/newgame", json={"player_starts": True}
    )
    assert response.status_code == 200
    data = response.json()
    state = data["state"]
    assert state["grid_size"] == 4
    assert state["horizontal_lines"] == {}
    assert state["vertical_lines"] == {}
    assert state["boxes"] == {}
    assert state["player_score"] == 0
    assert state["ai_score"] == 0


def test_dab_newgame_ai_first(auth_client):
    response = auth_client.post(
        "/api/game/dots-and-boxes/newgame", json={"player_starts": False}
    )
    assert response.status_code == 200
    data = response.json()
    state = data["state"]
    total_lines = len(state["horizontal_lines"]) + len(state["vertical_lines"])
    assert total_lines >= 1


def test_dab_resume(auth_client):
    auth_client.post(
        "/api/game/dots-and-boxes/newgame", json={"player_starts": True}
    )
    response = auth_client.get("/api/game/dots-and-boxes/resume")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] is not None
