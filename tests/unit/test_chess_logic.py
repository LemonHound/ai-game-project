import pytest

from game_logic.chess import ChessGame


@pytest.fixture
def game():
    return ChessGame()


def test_chess_logic_initial_board_structure(game):
    state = game.get_initial_state()
    board = state["board"]
    assert len(board) == 8
    assert all(len(row) == 8 for row in board)
    assert board[7][4] == "K"
    assert board[0][4] == "k"


def test_chess_logic_initial_state_fields(game):
    state = game.get_initial_state()
    assert state["current_player"] == "white"
    assert state["game_active"] is True
    assert state["king_positions"] == {"white": [7, 4], "black": [0, 4]}


def test_chess_logic_pawn_movement_rules(game):
    state = game.get_initial_state()
    moves = game._get_valid_moves(state, 6, 4)
    assert [5, 4] in moves
    assert [4, 4] in moves
    assert [3, 4] not in moves


def test_chess_logic_knight_movement_rules(game):
    state = game.get_initial_state()
    moves = game._get_valid_moves(state, 7, 1)
    assert [5, 0] in moves
    assert [5, 2] in moves


def test_chess_logic_board_evaluation(game):
    state = game.get_initial_state()
    game_end, winner = game._check_game_end(state)
    assert game_end is False
    assert winner is None


def test_chess_logic_piece_color(game):
    assert game._is_white_piece("P") is True
    assert game._is_white_piece("p") is False
    assert game._is_piece_color("P", "white") is True
    assert game._is_piece_color("p", "black") is True
