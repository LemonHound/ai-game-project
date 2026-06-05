"""Produce a throwaway chess model artifact (model.onnx + vocab.json + metadata.json).

Trains a tiny CNN on a few sample games purely to exercise the serving path.
Superseded by sub-project D's reproducible pipeline. Run with the train deps:
    pip install -r requirements-train.txt
    python scripts/train/produce_minimal_chess_artifact.py --out model_weights/chess
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import numpy as np
import tensorflow as tf
import tf2onnx
from chess import Board, pgn

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src", "backend"))
from game_engine.chess_board_encoding import board_to_matrix


def load_games(pgn_dir: str) -> list:
    """Load every game from every .pgn file in a directory.

    Args:
        pgn_dir: Directory containing .pgn files.

    Returns:
        A list of python-chess Game objects.
    """
    games = []
    for name in sorted(os.listdir(pgn_dir)):
        if not name.endswith(".pgn"):
            continue
        with open(os.path.join(pgn_dir, name), "r", encoding="utf-8") as handle:
            while True:
                game = pgn.read_game(handle)
                if game is None:
                    break
                games.append(game)
    return games


def build_examples(games: list) -> tuple[list, list]:
    """Build (board_tensor, uci_move) training pairs from games.

    Args:
        games: List of python-chess Game objects.

    Returns:
        Tuple of (X list of tensors, y list of UCI strings).
    """
    features = []
    labels = []
    for game in games:
        board = game.board()
        for move in game.mainline_moves():
            features.append(board_to_matrix(board))
            labels.append(move.uci())
            board.push(move)
    return features, labels


def build_vocab(ucis: list) -> dict:
    """Build a deterministic sorted UCI-to-index vocabulary.

    Args:
        ucis: All UCI move strings observed in training.

    Returns:
        Dict mapping UCI string to integer index.
    """
    return {uci: index for index, uci in enumerate(sorted(set(ucis)))}


def build_model(class_count: int) -> "tf.keras.Model":
    """Build Brian's CNN architecture for the given output size.

    Args:
        class_count: Number of distinct UCI moves (output classes).

    Returns:
        A compiled Keras model.
    """
    model = tf.keras.models.Sequential(
        [
            tf.keras.layers.Conv2D(64, (3, 3), activation="relu", input_shape=(8, 8, 12)),
            tf.keras.layers.Conv2D(128, (3, 3), activation="relu"),
            tf.keras.layers.Flatten(),
            tf.keras.layers.Dense(256, activation="relu"),
            tf.keras.layers.Dense(class_count, activation="softmax"),
        ]
    )
    model.compile(
        optimizer=tf.keras.optimizers.Adam(),
        loss="categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


def main() -> None:
    """Train a tiny model and write the artifact directory."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument(
        "--pgn-dir",
        default=os.path.join(os.path.dirname(__file__), "sample_pgn"),
    )
    parser.add_argument("--epochs", type=int, default=10)
    args = parser.parse_args()

    games = load_games(args.pgn_dir)
    features, labels = build_examples(games)
    vocab = build_vocab(labels)
    class_count = len(vocab)

    x = np.array(features, dtype=np.float32)
    y = tf.keras.utils.to_categorical([vocab[u] for u in labels], num_classes=class_count)

    model = build_model(class_count)
    model.fit(x, y, epochs=args.epochs, batch_size=16, verbose=2)

    os.makedirs(args.out, exist_ok=True)
    spec = (tf.TensorSpec((None, 8, 8, 12), tf.float32, name="input"),)
    tf2onnx.convert.from_keras(
        model, input_signature=spec, output_path=os.path.join(args.out, "model.onnx")
    )

    int_to_uci = {str(index): uci for uci, index in vocab.items()}
    with open(os.path.join(args.out, "vocab.json"), "w", encoding="utf-8") as handle:
        json.dump(int_to_uci, handle, indent=2)

    metadata = {
        "schema_version": 1,
        "class_count": class_count,
        "input_shape": [8, 8, 12],
        "source_notebook_commit": "minimal-producer",
        "dataset_manifest_id": None,
        "created_at": None,
        "content_hash": None,
    }
    with open(os.path.join(args.out, "metadata.json"), "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)

    print(f"Wrote artifact with {class_count} classes to {args.out}")


if __name__ == "__main__":
    main()
