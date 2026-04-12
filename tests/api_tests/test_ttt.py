"""API tests for Tic-Tac-Toe endpoints."""


def test_ttt_newgame_returns_empty_board(auth_client):
    response = auth_client.post(
        "/api/game/tic-tac-toe/newgame", json={"player_starts": True}
    )
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    assert "state" in data
    board = data["state"]["board"]
    assert len(board) == 9
    assert all(cell is None for cell in board)


def test_ttt_newgame_ai_first(auth_client):
    response = auth_client.post(
        "/api/game/tic-tac-toe/newgame", json={"player_starts": False}
    )
    assert response.status_code == 200
    data = response.json()
    board = data["state"]["board"]
    filled = [c for c in board if c is not None]
    assert len(filled) == 1


def test_ttt_resume_returns_session(auth_client):
    auth_client.post(
        "/api/game/tic-tac-toe/newgame", json={"player_starts": True}
    )
    response = auth_client.get("/api/game/tic-tac-toe/resume")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] is not None
    assert data["state"] is not None


def test_ttt_move_enqueues_successfully(auth_client):
    auth_client.post(
        "/api/game/tic-tac-toe/newgame", json={"player_starts": True}
    )
    response = auth_client.post(
        "/api/game/tic-tac-toe/move", json={"position": 4}
    )
    assert response.status_code == 202


def test_ttt_invalid_move_returns_422(auth_client):
    response = auth_client.post(
        "/api/game/tic-tac-toe/newgame", json={"player_starts": False}
    )
    assert response.status_code == 200
    board = response.json()["state"]["board"]
    occupied = next(i for i, cell in enumerate(board) if cell is not None)
    response = auth_client.post(
        "/api/game/tic-tac-toe/move", json={"position": occupied}
    )
    assert response.status_code == 422
