import chess
import numpy as np
from game_engine.chess_board_encoding import board_to_matrix


def test_start_position_shape_and_count():
    matrix = board_to_matrix(chess.Board())
    assert matrix.shape == (8, 8, 12)
    assert matrix.dtype == np.float32
    assert matrix.sum() == 32


def test_start_position_white_pawns_channel_0_rank_2():
    matrix = board_to_matrix(chess.Board())
    for col in range(8):
        assert matrix[1, col, 0] == 1.0


def test_start_position_black_pawns_channel_6_rank_7():
    matrix = board_to_matrix(chess.Board())
    for col in range(8):
        assert matrix[6, col, 6] == 1.0


def test_start_position_white_rook_and_king_channels():
    matrix = board_to_matrix(chess.Board())
    assert matrix[0, 0, 3] == 1.0
    assert matrix[0, 4, 5] == 1.0


def test_after_e4_pawn_moves_to_e4_plane():
    board = chess.Board("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1")
    matrix = board_to_matrix(board)
    assert matrix[3, 4, 0] == 1.0
    assert matrix[1, 4, 0] == 0.0


def test_board_encoding_golden_fen():
    board = chess.Board("rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2")
    matrix = board_to_matrix(board)
    assert matrix.sum() == 32
    assert matrix[3, 4, 0] == 1.0
    assert matrix[1, 4, 0] == 0.0
    assert matrix[2, 5, 1] == 1.0
    assert matrix[0, 6, 1] == 0.0
    assert matrix[4, 2, 6] == 1.0
    assert matrix[6, 2, 6] == 0.0
    assert matrix[7, 1, 7] == 1.0
