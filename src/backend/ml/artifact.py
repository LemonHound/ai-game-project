"""Loading and validation for the chess model artifact (ONNX + vocab + metadata)."""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any

import onnxruntime as ort


@dataclass
class ChessModelArtifact:
    """A loaded chess model artifact ready for inference.

    Attributes:
        session: The onnxruntime inference session for model.onnx.
        int_to_uci: Mapping from output class index to UCI move string.
        metadata: Parsed metadata.json contents.
        input_name: Name of the session's single input tensor.
    """

    session: ort.InferenceSession
    int_to_uci: dict[int, str]
    metadata: dict[str, Any]
    input_name: str


def _output_dim(session: ort.InferenceSession) -> int:
    """Return the size of the model's final output dimension.

    Args:
        session: An onnxruntime inference session.

    Returns:
        The last dimension of the first output's shape, as an int.
    """
    shape = session.get_outputs()[0].shape
    return int(shape[-1])


def validate_artifact(
    output_dim: int, int_to_uci: dict[int, str], metadata: dict[str, Any]
) -> None:
    """Check that vocabulary, metadata, and model output agree on class count.

    Args:
        output_dim: The model's output dimension.
        int_to_uci: The loaded index-to-UCI vocabulary.
        metadata: The loaded metadata dict.

    Raises:
        ValueError: If the vocabulary length, metadata class_count, and output
            dimension are not all equal.
    """
    vocab_len = len(int_to_uci)
    class_count = metadata.get("class_count")
    if not (vocab_len == class_count == output_dim):
        raise ValueError(
            f"Artifact mismatch: vocab={vocab_len}, "
            f"metadata.class_count={class_count}, model_output={output_dim}"
        )


def load_chess_model_artifact(model_dir: str) -> ChessModelArtifact:
    """Load and validate a chess model artifact directory.

    The directory must contain model.onnx, vocab.json, and metadata.json.

    Args:
        model_dir: Path to the artifact directory.

    Returns:
        A validated ChessModelArtifact.

    Raises:
        FileNotFoundError: If the directory or any required file is missing.
        ValueError: If the artifact fails validation.
    """
    if not os.path.isdir(model_dir):
        raise FileNotFoundError(
            f"CHESS_MODEL_DIR not found or not a directory: {model_dir}"
        )
    onnx_path = os.path.join(model_dir, "model.onnx")
    vocab_path = os.path.join(model_dir, "vocab.json")
    metadata_path = os.path.join(model_dir, "metadata.json")
    for path in (onnx_path, vocab_path, metadata_path):
        if not os.path.isfile(path):
            raise FileNotFoundError(f"Missing artifact file: {path}")

    with open(vocab_path, "r", encoding="utf-8") as handle:
        raw_vocab = json.load(handle)
    int_to_uci = {int(key): value for key, value in raw_vocab.items()}

    with open(metadata_path, "r", encoding="utf-8") as handle:
        metadata = json.load(handle)

    session = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
    validate_artifact(_output_dim(session), int_to_uci, metadata)
    input_name = session.get_inputs()[0].name
    return ChessModelArtifact(
        session=session,
        int_to_uci=int_to_uci,
        metadata=metadata,
        input_name=input_name,
    )
