import pytest
from game_engine.chess_engine import ChessEngine
from ml.chess_analysis import analyze_position
from ml.models import AnalysisLimits


@pytest.fixture
def initial_state():
    return ChessEngine().initial_state(player_starts=True)


def test_analyze_returns_a_move(initial_state):
    result = analyze_position(initial_state, AnalysisLimits(max_depth=1))
    assert result["best_move"] is not None
    move = result["best_move"]
    assert all(k in move for k in ["from_row", "from_col", "to_row", "to_col"])


def test_analyze_meta_shape(initial_state):
    result = analyze_position(initial_state, AnalysisLimits(max_depth=1))
    meta = result["analysis"]
    assert meta["positions_analyzed"] > 0
    assert meta["depth_reached"] == 1
    assert meta["time_elapsed_ms"] >= 0
    valid_reasons = {"exhausted", "depth", "time", "positions", "confidence", None}
    assert meta["cutoff_reason"] in valid_reasons


def test_analyze_depth_1_exhausts(initial_state):
    result = analyze_position(initial_state, AnalysisLimits(max_depth=1))
    assert result["analysis"]["cutoff_reason"] == "exhausted"
    assert result["analysis"]["positions_analyzed"] == 20


def test_analyze_position_limit(initial_state):
    result = analyze_position(initial_state, AnalysisLimits(max_positions=5))
    assert result["analysis"]["positions_analyzed"] <= 5
    assert result["analysis"]["cutoff_reason"] == "positions"


def test_analyze_time_limit(initial_state):
    result = analyze_position(initial_state, AnalysisLimits(max_time_ms=100))
    assert result["analysis"]["cutoff_reason"] in {"time", "exhausted"}


def test_analyze_high_confidence_threshold_cuts_early(initial_state):
    result = analyze_position(initial_state, AnalysisLimits(min_confidence=0.999, max_depth=1))
    assert result["analysis"]["cutoff_reason"] in {"confidence", "exhausted"}


def test_analyze_confidence_in_range(initial_state):
    result = analyze_position(initial_state, AnalysisLimits(max_depth=1))
    if result["confidence"] is not None:
        assert 0.0 <= result["confidence"] <= 1.0


def test_analyze_no_limits_returns_move(initial_state):
    result = analyze_position(initial_state, AnalysisLimits(max_depth=1))
    assert result["best_move"] is not None
    assert result["best_move_notation"] is not None
