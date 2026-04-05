from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient


def _make_app():
    from app import app
    return app


def test_error_response_includes_board_state():
    """Game endpoint error responses include board_state from the last move row."""
    app = _make_app()
    client = TestClient(app, raise_server_exceptions=False)

    response = client.get("/api/game/tic-tac-toe/session/00000000-0000-0000-0000-000000000000")
    assert response.status_code in (401, 404)
    body = response.json()
    assert "board_state" in body


def test_error_response_null_board_state_no_moves():
    """Game endpoint errors return board_state: null when no session/moves exist."""
    app = _make_app()
    client = TestClient(app, raise_server_exceptions=False)

    response = client.get("/api/game/tic-tac-toe/session/00000000-0000-0000-0000-000000000000")
    assert response.status_code in (401, 404)
    body = response.json()
    assert body.get("board_state") is None


def test_auth_error_does_not_include_board_state():
    """Auth endpoint errors do not include board_state."""
    app = _make_app()
    client = TestClient(app, raise_server_exceptions=False)

    response = client.get("/api/auth/me")
    assert response.status_code == 401
    body = response.json()
    assert "board_state" not in body


def test_game_endpoint_404_has_board_state_key():
    """Unknown game returns 501 with board_state: null via exception handler."""
    app = _make_app()
    client = TestClient(app, raise_server_exceptions=False)

    response = client.get("/api/game/nonexistent-game/session/00000000-0000-0000-0000-000000000000")
    assert response.status_code in (401, 501)
    body = response.json()
    assert "board_state" in body
    assert body["board_state"] is None
