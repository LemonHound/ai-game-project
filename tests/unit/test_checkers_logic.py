import pytest

from game_logic.checkers import CheckersGame


@pytest.fixture
def game():
    return CheckersGame()


def test_checkers_logic_initial_state(game):
    state = game.get_initial_state()
    board = state["board"]
    assert len(board) == 64
    r_count = sum(1 for p in board if p == "R")
    b_count = sum(1 for p in board if p == "B")
    assert r_count == 12
    assert b_count == 12


def test_checkers_logic_move_rules(game):
    state = game.get_initial_state()
    moves = game._get_valid_moves_for_piece(state, 40)
    assert len(moves) > 0
    for m in moves:
        assert m["from"] == 40


def test_checkers_logic_jump_logic(game):
    state = game.get_initial_state()
    state["board"] = ["_"] * 64
    state["board"][28] = "R"
    state["board"][21] = "B"
    state["current_player"] = "R"
    moves = game._get_valid_moves_for_piece(state, 28)
    capture_moves = [m for m in moves if m.get("captures")]
    assert len(capture_moves) > 0
    assert capture_moves[0]["to"] == 14


def test_checkers_logic_king_behavior(game):
    state = game.get_initial_state()
    state["board"] = ["_"] * 64
    state["board"][10] = "r"
    state["current_player"] = "R"
    moves = game._get_valid_moves_for_piece(state, 10)
    destinations = [m["to"] for m in moves]
    forward_moves = [d for d in destinations if d < 10]
    backward_moves = [d for d in destinations if d > 10]
    assert len(forward_moves) > 0 or len(backward_moves) > 0


def test_checkers_logic_winner_check(game):
    state = game.get_initial_state()
    state["board"] = ["_"] * 64
    state["board"][0] = "R"
    winner = game._check_winner(state)
    assert winner == "R"
