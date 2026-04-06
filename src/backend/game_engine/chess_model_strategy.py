"""ML-based chess AI strategy scaffold.

This module is only imported when CHESS_AI_STRATEGY=model. It provides the
scaffolding for Brian to plug his locally-trained chess model into the game
engine. The model accepts PGN input and returns UCI moves.

To activate: set CHESS_AI_STRATEGY=model in your environment or docker-compose.yml.
To deactivate: unset the variable or set it to "minimax" (the default).

See INSTRUCTIONS.txt in this directory for a full walkthrough.
"""
import logging
import os
from typing import Optional

from game_engine.base import AIStrategy, GameState, Move
from game_engine.chess_pgn import moves_to_pgn

logger = logging.getLogger(__name__)

_FILES = "abcdefgh"
_MODEL_PATH_ENV = "CHESS_MODEL_PATH"
_DEFAULT_MODEL_PATH = "/app/model_weights/chess.pt"


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
        if to_row == 0:
            promotion = promo_char.upper()
        else:
            promotion = promo_char

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


class ChessModelStrategy(AIStrategy):
    """AI strategy that delegates move generation to an external ML model.

    The model is expected to:
    1. Accept a PGN string representing the game so far
    2. Return a UCI move string (e.g. "e2e4", "e7e8q")

    The PGN is built from the algebraic move history stored in the database.
    Call set_move_history() before each generate_move() to provide the current
    move list.

    TODO (Brian): Replace _load_model and _predict with your model's loading
    and inference code. The rest of the plumbing (PGN construction, UCI
    conversion, move validation retry) is handled by the framework.
    """

    def __init__(self):
        """Load the ML model from the path specified by CHESS_MODEL_PATH."""
        model_path = os.getenv(_MODEL_PATH_ENV, _DEFAULT_MODEL_PATH)
        logger.info("chess_model_strategy_init", extra={"model_path": model_path})
        self._model = self._load_model(model_path)
        self._move_history: list[str] = []

    def _load_model(self, path: str):
        # TODO (Brian): Replace this with your model loading code.
        #
        # Example with PyTorch:
        #   import torch
        #   model = torch.load(path, map_location="cpu")
        #   model.eval()
        #   return model
        #
        # Example with ONNX:
        #   import onnxruntime as ort
        #   return ort.InferenceSession(path)
        raise NotImplementedError(
            f"Chess model loading not implemented. "
            f"Edit _load_model() in {__file__} to load your model from {path}. "
            f"See INSTRUCTIONS.txt for details."
        )

    def _predict(self, pgn: str) -> str:
        # TODO (Brian): Replace this with your model's inference call.
        #
        # This method receives the full PGN of the game so far and should
        # return a single UCI move string (e.g. "e2e4").
        #
        # Example:
        #   output = self._model(pgn)
        #   return output.best_move  # or however your model returns moves
        raise NotImplementedError(
            f"Chess model prediction not implemented. "
            f"Edit _predict() in {__file__} to run inference with your model. "
            f"See INSTRUCTIONS.txt for details."
        )

    def set_move_history(self, algebraic_moves: list[str]) -> None:
        """Provide the current game's SAN move list before calling generate_move.

        This is called automatically by the game router before each AI turn.
        The moves come from chess_games.move_list_algebraic in the database.

        Args:
            algebraic_moves: Ordered list of SAN strings, e.g. ["e4", "e5", "Nf3"].
        """
        self._move_history = list(algebraic_moves)

    def generate_move(self, state: GameState) -> tuple[Move, Optional[float]]:
        """Generate a move by passing the game's PGN to the ML model.

        Builds PGN from the stored move history, sends it to the model, and
        converts the UCI response back to the engine's move format.

        Args:
            state: Current game state dict (used for FEN fallback info).

        Returns:
            Tuple of (engine_move_dict, None). The eval is always None since
            the model does not provide a numeric evaluation.
        """
        pgn = moves_to_pgn(
            self._move_history,
            white_name="Player" if state.get("player_color") == "white" else "AI",
            black_name="AI" if state.get("player_color") == "white" else "Player",
        )
        logger.info(
            "chess_model_pgn_input",
            extra={"pgn": pgn, "fen": state.get("fen", ""), "move_count": len(self._move_history)},
        )

        uci_move = self._predict(pgn)
        logger.info("chess_model_uci_output", extra={"uci_move": uci_move})

        move = uci_to_engine_move(uci_move)
        return move, None
