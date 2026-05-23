import time
import pytest
from ml.chess_analysis import AnalysisSession
from ml.models import AnalysisLimits


def test_no_limits_always_continues():
    s = AnalysisSession(AnalysisLimits())
    assert s.should_continue() is True
    assert s.should_continue(confidence=0.0) is True
    s.cancel_timer()


def test_time_cutoff():
    s = AnalysisSession(AnalysisLimits(max_time_ms=50))
    time.sleep(0.1)
    assert s.should_continue() is False
    assert s.cutoff_reason == "time"
    s.cancel_timer()


def test_position_cutoff():
    s = AnalysisSession(AnalysisLimits(max_positions=3))
    s.positions_analyzed = 3
    assert s.should_continue() is False
    assert s.cutoff_reason == "positions"
    s.cancel_timer()


def test_confidence_cutoff():
    s = AnalysisSession(AnalysisLimits(min_confidence=0.5))
    assert s.should_continue(confidence=0.6) is True
    assert s.should_continue(confidence=0.4) is False
    assert s.cutoff_reason == "confidence"
    s.cancel_timer()


def test_confidence_cutoff_skipped_when_none():
    s = AnalysisSession(AnalysisLimits(min_confidence=0.5))
    assert s.should_continue(confidence=None) is True
    s.cancel_timer()


def test_elapsed_ms_increases():
    s = AnalysisSession(AnalysisLimits())
    time.sleep(0.1)
    assert s.elapsed_ms() >= 50
    s.cancel_timer()


def test_cutoff_reason_none_before_any_cutoff():
    s = AnalysisSession(AnalysisLimits(max_positions=10))
    s.positions_analyzed = 5
    s.should_continue()
    assert s.cutoff_reason is None
    s.cancel_timer()


def test_first_cutoff_wins():
    s = AnalysisSession(AnalysisLimits(max_positions=0, min_confidence=0.9))
    s.positions_analyzed = 0
    s.should_continue(confidence=0.1)
    assert s.cutoff_reason == "positions"
    s.cancel_timer()
