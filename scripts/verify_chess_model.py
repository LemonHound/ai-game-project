"""Load a chess model artifact and print a predicted move. Serving deps only.

Usage:
    CHESS_MODEL_DIR=model_weights/chess python scripts/verify_chess_model.py
    python scripts/verify_chess_model.py --model-dir tests/fixtures/chess_model_tiny
    python scripts/verify_chess_model.py --fen "<FEN>"
"""
from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src", "backend"))
from game_engine.chess_engine import ChessEngine
from game_engine.chess_model_strategy import ChessModelStrategy
from ml.artifact import load_chess_model_artifact


def main() -> None:
    """Print the model's chosen move for a FEN or the opening position."""
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--model-dir", default=os.getenv("CHESS_MODEL_DIR", "model_weights/chess")
    )
    parser.add_argument("--fen", default=None)
    args = parser.parse_args()

    artifact = load_chess_model_artifact(args.model_dir)
    strategy = ChessModelStrategy(artifact=artifact)

    if args.fen:
        print("predicted uci:", strategy._predict(args.fen))
        return
    engine = ChessEngine()
    state = {**engine.initial_state(player_starts=False), "current_turn": "ai"}
    move, _ = strategy.generate_move(state)
    print("engine move:", move)


if __name__ == "__main__":
    main()
