import os

import pytest

from game_engine.chess_engine import ChessEngine
from game_engine.chess_model_strategy import ChessModelStrategy
from ml.artifact import load_chess_model_artifact

_FIXTURE = os.path.join(os.path.dirname(__file__), "..", "fixtures", "chess_model_tiny")

pytestmark = pytest.mark.skipif(
    not os.path.isfile(os.path.join(_FIXTURE, "model.onnx")),
    reason="tiny ONNX fixture not generated; run scripts/train/produce_minimal_chess_artifact.py in a TensorFlow env",
)


def test_fixture_artifact_loads_and_validates():
    artifact = load_chess_model_artifact(_FIXTURE)
    assert len(artifact.int_to_uci) == artifact.metadata["class_count"]
    assert artifact.input_name == "input"


def test_fixture_strategy_returns_legal_move_for_start_position():
    artifact = load_chess_model_artifact(_FIXTURE)
    strategy = ChessModelStrategy(artifact=artifact)
    engine = ChessEngine()
    state = {**engine.initial_state(player_starts=False), "current_turn": "ai"}
    move, _ = strategy.generate_move(state)
    assert move in engine.get_legal_moves(state)
