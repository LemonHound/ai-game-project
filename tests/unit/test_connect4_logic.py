import pytest

from game_logic.connect4 import Connect4Game


@pytest.fixture
def game():
    return Connect4Game()


def test_connect4_logic_initial_state(game):
    state = game.get_initial_state()
    board = state["board"]
    assert len(board) == 6
    assert all(len(row) == 7 for row in board)
    assert all(cell is None for row in board for cell in row)


def test_connect4_logic_drop_mechanics(game):
    state = game.get_initial_state()
    row = game._drop_piece(state["board"], 3, "X")
    assert row == 5
    assert state["board"][5][3] == "X"
    row = game._drop_piece(state["board"], 3, "O")
    assert row == 4
    assert state["board"][4][3] == "O"


def test_connect4_logic_column_full(game):
    state = game.get_initial_state()
    for _ in range(6):
        game._drop_piece(state["board"], 0, "X")
    row = game._drop_piece(state["board"], 0, "O")
    assert row is None


def test_connect4_logic_win_scanning_horizontal(game):
    state = game.get_initial_state()
    for c in range(4):
        game._drop_piece(state["board"], c, "X")
    assert game._check_winner(state["board"], 5, 3, "X") is True


def test_connect4_logic_win_scanning_vertical(game):
    state = game.get_initial_state()
    for _ in range(4):
        game._drop_piece(state["board"], 0, "X")
    assert game._check_winner(state["board"], 2, 0, "X") is True


def test_connect4_logic_find_winning_col(game):
    state = game.get_initial_state()
    for c in range(3):
        game._drop_piece(state["board"], c, "X")
    col = game._find_winning_col(state["board"], "X")
    assert col == 3
