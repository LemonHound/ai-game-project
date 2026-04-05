import pytest

from game_logic.tic_tac_toe import TicTacToe


@pytest.fixture
def game():
    return TicTacToe()


def test_ttt_logic_initial_state(game):
    state = game.get_initial_state()
    assert len(state["board"]) == 9
    assert all(cell is None for cell in state["board"])
    assert state["game_over"] is False
    assert state["winner"] is None
    assert state["current_player"] == "X"


def test_ttt_logic_win_detection(game):
    state = game.get_initial_state()
    state["board"] = ["X", "X", None, "O", "O", None, None, None, None]
    result = game.apply_move(state, 2)
    assert result["game_over_after_player"] is True


def test_ttt_logic_draw_detection(game):
    state = game.get_initial_state()
    state["board"] = ["X", "O", "X", "X", "O", "O", "O", None, "X"]
    state["current_player"] = "X"
    result = game.apply_move(state, 7)
    assert result["game_over"] is True
    assert result["winner"] == "tie"


def test_ttt_logic_invalid_position_raises(game):
    state = game.get_initial_state()
    with pytest.raises(ValueError):
        game.apply_move(state, 9)


def test_ttt_logic_occupied_cell_raises(game):
    state = game.get_initial_state()
    state["board"][4] = "X"
    with pytest.raises(ValueError):
        game.apply_move(state, 4)


def test_ttt_logic_ai_move_generated(game):
    state = game.get_initial_state()
    result = game.apply_move(state, 4)
    assert result["ai_move"] is not None
    assert result["board_after_ai"]["board"][result["ai_move"]] == "O"
