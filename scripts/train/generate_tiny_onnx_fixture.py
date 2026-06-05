"""Generate a tiny, TensorFlow-free chess model artifact for the serving path.

Builds a minimal ONNX network (reshape + matmul) sized to a vocabulary derived
from the sample PGN games, plus vocab.json and metadata.json. The weights are
not trained; this exists to exercise the full load/encode/predict/mask path and
to serve as the committed integration-test fixture. The real trained artifact
comes from the data and training platform.

Usage:
    pip install onnx numpy chess
    python scripts/train/generate_tiny_onnx_fixture.py --out tests/fixtures/chess_model_tiny
"""
from __future__ import annotations

import argparse
import json
import os

import numpy as np
import onnx
from chess import pgn
from onnx import TensorProto, helper, numpy_helper


def load_ucis(pgn_dir: str) -> list:
    """Collect every UCI move from every .pgn file in a directory.

    Args:
        pgn_dir: Directory containing .pgn files.

    Returns:
        A list of UCI move strings in game order.
    """
    ucis = []
    for name in sorted(os.listdir(pgn_dir)):
        if not name.endswith(".pgn"):
            continue
        with open(os.path.join(pgn_dir, name), "r", encoding="utf-8") as handle:
            while True:
                game = pgn.read_game(handle)
                if game is None:
                    break
                board = game.board()
                for move in game.mainline_moves():
                    ucis.append(move.uci())
                    board.push(move)
    return ucis


def build_model(num_classes: int) -> onnx.ModelProto:
    """Build a minimal ONNX model mapping an 8x8x12 board to class scores.

    Args:
        num_classes: Number of output classes (vocabulary size).

    Returns:
        A checked ONNX ModelProto with input 'input' and output 'output'.
    """
    rng = np.random.default_rng(0)
    weights = (rng.standard_normal((768, num_classes)) * 0.01).astype(np.float32)
    inp = helper.make_tensor_value_info("input", TensorProto.FLOAT, [None, 8, 8, 12])
    out = helper.make_tensor_value_info("output", TensorProto.FLOAT, [None, num_classes])
    shape_init = numpy_helper.from_array(np.array([-1, 768], dtype=np.int64), name="reshape_shape")
    weight_init = numpy_helper.from_array(weights, name="W")
    reshape = helper.make_node("Reshape", ["input", "reshape_shape"], ["flat"])
    matmul = helper.make_node("MatMul", ["flat", "W"], ["output"])
    graph = helper.make_graph(
        [reshape, matmul], "tiny_chess", [inp], [out], initializer=[shape_init, weight_init]
    )
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 13)])
    onnx.checker.check_model(model)
    return model


def main() -> None:
    """Write model.onnx, vocab.json, and metadata.json to the output directory."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument(
        "--pgn-dir", default=os.path.join(os.path.dirname(__file__), "sample_pgn")
    )
    args = parser.parse_args()

    vocab = sorted(set(load_ucis(args.pgn_dir)))
    num_classes = len(vocab)

    os.makedirs(args.out, exist_ok=True)
    onnx.save(build_model(num_classes), os.path.join(args.out, "model.onnx"))

    int_to_uci = {str(index): uci for index, uci in enumerate(vocab)}
    with open(os.path.join(args.out, "vocab.json"), "w", encoding="utf-8") as handle:
        json.dump(int_to_uci, handle, indent=2)

    metadata = {
        "schema_version": 1,
        "class_count": num_classes,
        "input_shape": [8, 8, 12],
        "source_notebook_commit": "tiny-onnx-fixture",
        "dataset_manifest_id": None,
        "created_at": None,
        "content_hash": None,
    }
    with open(os.path.join(args.out, "metadata.json"), "w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)

    print(f"Wrote tiny artifact with {num_classes} classes to {args.out}")


if __name__ == "__main__":
    main()
