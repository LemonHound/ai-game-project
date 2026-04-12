"""Unit tests for game training data — move_list correctness and position replay."""
import pytest

from game_engine.chess_engine import ChessEngine

_MOVES = [
    {"fromRow": 6, "fromCol": 4, "toRow": 4, "toCol": 4},
    {"fromRow": 1, "fromCol": 4, "toRow": 3, "toCol": 4},
    {"fromRow": 7, "fromCol": 6, "toRow": 5, "toCol": 5},
]
_EXPECTED_SAN = ["e4", "e5", "Nf3"]


@pytest.fixture
def engine():
    return ChessEngine()


@pytest.fixture
def fresh_state(engine):
    return engine.initial_state(player_starts=True)


def test_chess_san_notation_stored(engine, fresh_state):
    new_state = engine.apply_move(fresh_state, _MOVES[0])
    notation = new_state.get("last_move", {}).get("notation", "")
    assert notation == "e4", f"e2-e4 must produce SAN 'e4', got {notation!r}"


def test_move_list_append_order(engine, fresh_state):
    notations = []
    state = fresh_state
    for move in _MOVES:
        state = engine.apply_move(state, move)
        notations.append(state.get("last_move", {}).get("notation", ""))

    assert len(notations) == len(_MOVES)
    assert notations == _EXPECTED_SAN, f"SAN order mismatch: {notations}"


def test_position_replay_from_move_list(engine, fresh_state):
    state = fresh_state
    for move in _MOVES:
        state = engine.apply_move(state, move)

    replayed = fresh_state
    for move in _MOVES:
        replayed = engine.apply_move(replayed, move)

    assert replayed["board"] == state["board"], "Replaying move sequence must produce identical board"
    assert replayed.get("fen") == state.get("fen"), "FEN must match after identical move sequence replay"
