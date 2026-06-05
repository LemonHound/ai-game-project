"""ML chess strategy: runs Brian's CNN, served as an ONNX artifact, to pick moves.

Active only when CHESS_AI_STRATEGY=model. The artifact directory is given by
CHESS_MODEL_DIR and must contain model.onnx, vocab.json, and metadata.json.
"""
from __future__ import annotations

import logging
import os
import random
from typing import Optional

import numpy as np
from chess import Board

from game_engine.base import AIStrategy, GameState, Move
from game_engine.chess_board_encoding import board_to_matrix
from game_engine.chess_engine import ChessEngine
from ml.artifact import ChessModelArtifact, load_chess_model_artifact

logger = logging.getLogger(__name__)

_FILES = "abcdefgh"
_MODEL_DIR_ENV = "CHESS_MODEL_DIR"
_DEFAULT_MODEL_DIR = "/app/model_weights/chess"


def uci_to_engine_move(uci: str) -> Move:
    """Convert a UCI move string to the engine's move dict format.

    The engine uses row 0 = rank 8, row 7 = rank 1, col 0 = a-file, col 7 = h-file.

    Args:
        uci: UCI move string, e.g. "e2e4" or "e7e8q" (with promotion).

    Returns:
        Dict with fromRow, fromCol, toRow, toCol, promotionPiece.

    Raises:
        ValueError: If the UCI string is malformed.
    """
    if len(uci) < 4 or len(uci) > 5:
        raise ValueError(f"Invalid UCI move length: {uci!r}")

    from_file = uci[0]
    from_rank = uci[1]
    to_file = uci[2]
    to_rank = uci[3]

    if from_file not in _FILES or to_file not in _FILES:
        raise ValueError(f"Invalid file in UCI move: {uci!r}")
    if from_rank not in "12345678" or to_rank not in "12345678":
        raise ValueError(f"Invalid rank in UCI move: {uci!r}")

    from_col = _FILES.index(from_file)
    from_row = 8 - int(from_rank)
    to_col = _FILES.index(to_file)
    to_row = 8 - int(to_rank)

    promotion = None
    if len(uci) == 5:
        promo_char = uci[4].lower()
        if promo_char not in "qrbn":
            raise ValueError(f"Invalid promotion piece in UCI move: {uci!r}")
        promotion = promo_char.upper() if to_row == 0 else promo_char

    return {
        "fromRow": from_row,
        "fromCol": from_col,
        "toRow": to_row,
        "toCol": to_col,
        "promotionPiece": promotion,
    }


def engine_move_to_uci(move: Move) -> str:
    """Convert an engine move dict to a UCI string.

    Args:
        move: Dict with fromRow, fromCol, toRow, toCol, and optional promotionPiece.

    Returns:
        UCI string, e.g. "e2e4" or "e7e8q".
    """
    from_file = _FILES[move["fromCol"]]
    from_rank = 8 - move["fromRow"]
    to_file = _FILES[move["toCol"]]
    to_rank = 8 - move["toRow"]
    uci = f"{from_file}{from_rank}{to_file}{to_rank}"
    if move.get("promotionPiece"):
        uci += move["promotionPiece"].lower()
    return uci


def select_move(
    predictions: np.ndarray,
    int_to_uci: dict[int, str],
    legal_uci: set[str],
) -> Optional[str]:
    """Return the highest-scoring predicted move that is legal, or None.

    Args:
        predictions: 1-D array of class scores from the model.
        int_to_uci: Mapping from class index to UCI move string.
        legal_uci: Legal moves for the current position, in UCI form.

    Returns:
        The UCI string of the best legal move, or None if no legal move is in
        the model's vocabulary.
    """
    for index in np.argsort(predictions)[::-1]:
        uci = int_to_uci.get(int(index))
        if uci is not None and uci in legal_uci:
            return uci
    return None


class ChessModelStrategy(AIStrategy):
    """AIStrategy that selects moves with Brian's CNN served as an ONNX artifact."""

    def __init__(self, artifact: Optional[ChessModelArtifact] = None) -> None:
        """Load the model artifact (from CHESS_MODEL_DIR unless one is injected).

        Args:
            artifact: A preloaded artifact, used by tests. When None, the artifact
                is loaded from the directory named by CHESS_MODEL_DIR at startup.
        """
        if artifact is None:
            model_dir = os.getenv(_MODEL_DIR_ENV, _DEFAULT_MODEL_DIR)
            logger.info("chess_model_strategy_init", extra={"model_dir": model_dir})
            artifact = load_chess_model_artifact(model_dir)
        self._artifact = artifact
        self._engine = ChessEngine()

    def set_move_history(self, algebraic_moves: list[str]) -> None:
        """Accept the SAN move history for interface compatibility (unused).

        The model reads the board from the current FEN, so move history is not
        needed. Retained because the game router calls this before each AI turn.

        Args:
            algebraic_moves: Ordered SAN move strings; ignored.
        """

    def _predict(self, fen: str) -> Optional[str]:
        """Run the model on a FEN and return the best legal UCI move, or None.

        Args:
            fen: FEN string of the position to move from.

        Returns:
            UCI move string, or None if no legal move is in the vocabulary.
        """
        board = Board(fen)
        legal_uci = {move.uci() for move in board.legal_moves}
        if not legal_uci:
            return None
        model_input = np.expand_dims(board_to_matrix(board), axis=0)
        outputs = self._artifact.session.run(
            None, {self._artifact.input_name: model_input}
        )
        predictions = np.asarray(outputs[0]).reshape(-1)
        return select_move(predictions, self._artifact.int_to_uci, legal_uci)

    def generate_move(self, state: GameState) -> tuple[Move, Optional[float]]:
        """Generate a move for the current state using the model.

        Reads the position as FEN, asks the model for a legal move, and converts
        it to the engine move format. Falls back to a random legal move if the
        model declines or anything goes wrong. The position is assumed
        non-terminal; the game router only invokes the AI when legal moves exist.

        Args:
            state: Current game state dict with current_turn set to "ai".

        Returns:
            Tuple of (engine_move_dict, None).
        """
        try:
            fen = self._engine.get_state_fen(state)
            logger.info("chess_model_fen_input", extra={"fen": fen})
            uci = self._predict(fen)
            if uci is not None:
                logger.info("chess_model_uci_output", extra={"uci": uci})
                return uci_to_engine_move(uci), None
            logger.warning("chess_model_no_vocab_move", extra={"fen": fen})
        except Exception:
            logger.exception("chess_model_predict_failed")
        legal = self._engine.get_legal_moves(state)
        if not legal:
            raise ValueError("generate_move called on a terminal position with no legal moves")
        return random.choice(legal), None
