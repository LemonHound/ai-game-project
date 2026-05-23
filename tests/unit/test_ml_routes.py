import pytest
from fastapi.testclient import TestClient
from game_engine.chess_engine import ChessEngine
from app import app
from auth_deps import require_user


@pytest.fixture
def client():
    app.dependency_overrides[require_user] = lambda: {"user_id": "test", "email": "test@test.com"}
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def state():
    return ChessEngine().initial_state(player_starts=True)


def test_expand_requires_auth(state):
    with TestClient(app) as c:
        r = c.post("/api/ml/chess/expand", json={"state": state})
    assert r.status_code == 401


def test_analyze_requires_auth(state):
    with TestClient(app) as c:
        r = c.post("/api/ml/chess/analyze", json={"state": state})
    assert r.status_code == 401


def test_expand_returns_20_moves(client, state):
    r = client.post("/api/ml/chess/expand", json={"state": state})
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 20
    assert len(body["moves"]) == 20


def test_expand_move_shape(client, state):
    r = client.post("/api/ml/chess/expand", json={"state": state})
    move = r.json()["moves"][0]["move"]
    assert all(k in move for k in ["from_row", "from_col", "to_row", "to_col"])


def test_analyze_returns_best_move(client, state):
    body = {"state": state, "limits": {"max_depth": 1}}
    r = client.post("/api/ml/chess/analyze", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["best_move"] is not None
    assert "analysis" in data
    assert data["analysis"]["positions_analyzed"] > 0


def test_analyze_all_limits_optional(client, state):
    r = client.post("/api/ml/chess/analyze", json={"state": state, "limits": {"max_time_ms": 500}})
    assert r.status_code == 200


def test_analyze_cutoff_reason_in_payload(client, state):
    body = {"state": state, "limits": {"max_positions": 3}}
    r = client.post("/api/ml/chess/analyze", json=body)
    data = r.json()
    assert data["analysis"]["cutoff_reason"] == "positions"


def test_expand_rejects_missing_board(client):
    r = client.post("/api/ml/chess/expand", json={"state": {"current_player": "white"}})
    assert r.status_code == 422


def test_analyze_rejects_missing_board(client):
    r = client.post("/api/ml/chess/analyze", json={"state": {"current_player": "white"}})
    assert r.status_code == 422
