"""API tests for Checkers endpoints."""


def test_checkers_newgame_returns_initial_board(auth_client):
    response = auth_client.post(
        "/api/game/checkers/newgame", json={"player_starts": True}
    )
    assert response.status_code == 200
    data = response.json()
    board = data["state"]["board"]
    assert len(board) == 64
    r_count = sum(1 for p in board if p == "R")
    b_count = sum(1 for p in board if p == "B")
    assert r_count == 12
    assert b_count == 12


def test_checkers_resume(auth_client):
    auth_client.post(
        "/api/game/checkers/newgame", json={"player_starts": True}
    )
    response = auth_client.get("/api/game/checkers/resume")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] is not None
