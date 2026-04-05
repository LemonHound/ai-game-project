import pytest

from game_logic.dots_and_boxes import DotsAndBoxes


@pytest.fixture
def game():
    return DotsAndBoxes()


def test_dab_logic_initial_state(game):
    state = game.get_initial_state()
    assert state["grid_size"] == 4
    assert state["horizontal_lines"] == {}
    assert state["vertical_lines"] == {}
    assert state["boxes"] == {}
    assert state["player_score"] == 0
    assert state["ai_score"] == 0


def test_dab_logic_line_placement(game):
    state = game.get_initial_state()
    count = game._apply_line(state, "horizontal", 0, 0, "X")
    assert "0,0" in state["horizontal_lines"]
    assert count == 0


def test_dab_logic_box_completion_detection(game):
    state = game.get_initial_state()
    game._apply_line(state, "horizontal", 0, 0, "X")
    game._apply_line(state, "horizontal", 1, 0, "X")
    game._apply_line(state, "vertical", 0, 0, "X")
    count = game._apply_line(state, "vertical", 0, 1, "X")
    assert count == 1
    assert "0,0" in state["boxes"]


def test_dab_logic_is_box_complete(game):
    state = game.get_initial_state()
    assert game._is_box_complete(state, 0, 0) is False
    game._apply_line(state, "horizontal", 0, 0, "X")
    game._apply_line(state, "horizontal", 1, 0, "X")
    game._apply_line(state, "vertical", 0, 0, "X")
    game._apply_line(state, "vertical", 0, 1, "X")
    assert game._is_box_complete(state, 0, 0) is True


def test_dab_logic_available_moves(game):
    state = game.get_initial_state()
    moves = game._get_available_moves(state)
    total_lines = 2 * 4 * (4 + 1)
    assert len(moves) == total_lines


def test_dab_logic_valid_move_check(game):
    state = game.get_initial_state()
    assert game._is_valid_move(state, "horizontal", 0, 0) is True
    game._apply_line(state, "horizontal", 0, 0, "X")
    assert game._is_valid_move(state, "horizontal", 0, 0) is False


def test_dab_logic_invalid_bounds(game):
    state = game.get_initial_state()
    assert game._is_valid_move(state, "horizontal", -1, 0) is False
    assert game._is_valid_move(state, "vertical", 0, 5) is False
