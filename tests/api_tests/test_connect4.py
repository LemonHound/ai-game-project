"""API tests for Connect4 endpoints."""


def test_connect4_newgame_returns_empty_columns(auth_client):
    response = auth_client.post(
        "/api/game/connect4/newgame", json={"player_starts": True}
    )
    assert response.status_code == 200
    data = response.json()
    board = data["state"]["board"]
    assert len(board) == 6
    assert all(len(row) == 7 for row in board)
    assert all(cell is None for row in board for cell in row)


def test_connect4_newgame_ai_first(auth_client):
    response = auth_client.post(
        "/api/game/connect4/newgame", json={"player_starts": False}
    )
    assert response.status_code == 200
    data = response.json()
    board = data["state"]["board"]
    filled = sum(1 for row in board for cell in row if cell is not None)
    assert filled == 1


def test_connect4_resume(auth_client):
    auth_client.post(
        "/api/game/connect4/newgame", json={"player_starts": True}
    )
    response = auth_client.get("/api/game/connect4/resume")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] is not None
