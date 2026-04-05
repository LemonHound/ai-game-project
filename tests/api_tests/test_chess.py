"""API tests for Chess endpoints."""


def test_chess_newgame_returns_starting_position(auth_client):
    response = auth_client.post(
        "/api/game/chess/newgame", json={"player_starts": True}
    )
    assert response.status_code == 200
    data = response.json()
    board = data["state"]["board"]
    assert len(board) == 8
    assert all(len(row) == 8 for row in board)
    piece_count = sum(1 for row in board for cell in row if cell is not None)
    assert piece_count == 32


def test_chess_newgame_ai_first(auth_client):
    response = auth_client.post(
        "/api/game/chess/newgame", json={"player_starts": False}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["state"]["last_move"] is not None


def test_chess_resume(auth_client):
    auth_client.post("/api/game/chess/newgame", json={"player_starts": True})
    response = auth_client.get("/api/game/chess/resume")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] is not None
