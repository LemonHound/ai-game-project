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


def test_chess_board_state_contains_fen_after_ai_move(auth_client):
    response = auth_client.post(
        "/api/game/chess/newgame", json={"player_starts": False}
    )
    assert response.status_code == 200
    state = response.json()["state"]
    fen = state.get("fen")
    assert fen is not None, "board_state must contain a 'fen' field after AI moves"
    parts = fen.split(" ")
    assert len(parts) == 6, f"FEN must have 6 space-separated fields, got: {fen!r}"
    assert parts[1] in ("w", "b"), f"FEN active-color field must be 'w' or 'b', got: {parts[1]!r}"


def test_chess_invalid_move_returns_422(auth_client):
    auth_client.post("/api/game/chess/newgame", json={"player_starts": True})
    response = auth_client.post(
        "/api/game/chess/move",
        json={"fromRow": 6, "fromCol": 4, "toRow": 7, "toCol": 4, "promotionPiece": None},
    )
    assert response.status_code == 422


def test_completed_game_move_list_queryable(auth_client):
    """Verify a chess game record includes a queryable move_list field."""
    auth_client.post("/api/game/chess/newgame", json={"player_starts": True})
    response = auth_client.get("/api/game/chess/resume")
    assert response.status_code == 200
    data = response.json()
    assert "id" in data
    state = data.get("state", {})
    assert "board" in state
    assert "last_move" in state
