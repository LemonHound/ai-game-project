import pytest
from game_engine.chess_engine import ChessEngine
from ml.chess_analysis import expand_position


@pytest.fixture
def initial_state():
    return ChessEngine().initial_state(player_starts=True)


def test_expand_initial_returns_20_moves(initial_state):
    result = expand_position(initial_state)
    assert len(result) == 20


def test_expand_move_keys(initial_state):
    result = expand_position(initial_state)
    move = result[0]["move"]
    assert set(move.keys()) == {"from_row", "from_col", "to_row", "to_col", "promotion_piece"}


def test_expand_child_state_is_valid(initial_state):
    result = expand_position(initial_state)
    child = result[0]["state"]
    assert "board" in child
    assert "current_player" in child
    assert child["current_player"] == "black"


def test_expand_eval_score_in_range(initial_state):
    result = expand_position(initial_state)
    for item in result:
        assert item["eval_score"] is not None
        assert 0.0 <= item["eval_score"] <= 1.0


def test_expand_initial_not_terminal(initial_state):
    result = expand_position(initial_state)
    assert all(not item["is_terminal"] for item in result)


def test_expand_terminal_outcome_none_for_non_terminal(initial_state):
    result = expand_position(initial_state)
    assert all(item["terminal_outcome"] is None for item in result)


def test_expand_notation_present(initial_state):
    result = expand_position(initial_state)
    assert all(item["notation"] is not None for item in result)
