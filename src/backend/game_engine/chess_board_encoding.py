"""Board-to-tensor encoding for the chess CNN, ported verbatim from Brian's notebook."""
from __future__ import annotations

import numpy as np
from chess import Board


def board_to_matrix(board: Board) -> np.ndarray:
    """Encode a python-chess board as the 8x8x12 tensor the CNN was trained on.

    Channels 0-5 hold white piece types (pawn through king) and 6-11 hold black,
    using python-chess square indexing where divmod(square, 8) gives (rank, file).

    Args:
        board: A python-chess Board representing the position to encode.

    Returns:
        A float32 array of shape (8, 8, 12) with 1.0 at each occupied piece plane.
    """
    matrix = np.zeros((8, 8, 12), dtype=np.float32)
    for square, piece in board.piece_map().items():
        row, col = divmod(square, 8)
        piece_type = piece.piece_type - 1
        piece_color = 0 if piece.color else 6
        matrix[row, col, piece_type + piece_color] = 1.0
    return matrix
