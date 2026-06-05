import chess
import numpy as np
from game_engine.chess_model_strategy import (
    engine_move_to_uci,
    select_move,
    uci_to_engine_move,
)


def test_select_move_picks_highest_ranked_legal():
    predictions = np.array([0.1, 0.9, 0.5])
    int_to_uci = {0: "e2e4", 1: "d2d4", 2: "g1f3"}
    legal = {"e2e4", "g1f3"}
    assert select_move(predictions, int_to_uci, legal) == "g1f3"


def test_select_move_returns_none_when_no_legal_in_vocab():
    predictions = np.array([0.5, 0.5])
    int_to_uci = {0: "e2e4", 1: "d2d4"}
    legal = {"a2a3"}
    assert select_move(predictions, int_to_uci, legal) is None


def test_uci_engine_roundtrip():
    for uci in ["e2e4", "g1f3", "e7e8q", "a2a1q"]:
        assert engine_move_to_uci(uci_to_engine_move(uci)) == uci


from game_engine.chess_engine import ChessEngine
from game_engine.chess_model_strategy import ChessModelStrategy
from ml.artifact import ChessModelArtifact


class _FakeSession:
    def __init__(self, predictions):
        self._predictions = np.asarray(predictions, dtype=np.float32)

    def run(self, output_names, feed):
        return [self._predictions.reshape(1, -1)]


def _artifact(predictions, int_to_uci):
    return ChessModelArtifact(
        session=_FakeSession(predictions),
        int_to_uci=int_to_uci,
        metadata={"class_count": len(int_to_uci)},
        input_name="input",
    )


def _ai_start_state():
    return {**ChessEngine().initial_state(player_starts=False), "current_turn": "ai"}


def test_generate_move_returns_model_choice():
    artifact = _artifact([1.0, 0.0], {0: "e2e4", 1: "d2d4"})
    strategy = ChessModelStrategy(artifact=artifact)
    move, score = strategy.generate_move(_ai_start_state())
    assert move == {
        "fromRow": 6,
        "fromCol": 4,
        "toRow": 4,
        "toCol": 4,
        "promotionPiece": None,
    }
    assert score is None


def test_generate_move_falls_back_to_legal_when_vocab_has_no_legal_move():
    artifact = _artifact([1.0], {0: "a1a2"})
    strategy = ChessModelStrategy(artifact=artifact)
    state = _ai_start_state()
    move, score = strategy.generate_move(state)
    legal = ChessEngine().get_legal_moves(state)
    assert move in legal


def test_get_state_fen_yields_python_chess_legal_moves_at_start():
    engine = ChessEngine()
    state = engine.initial_state(player_starts=False)
    board = chess.Board(engine.get_state_fen(state))
    assert board.legal_moves.count() == 20
    assert len(engine.get_legal_moves(state)) == 20
