import os
from unittest.mock import patch

import pytest

from game_engine.base import DeterministicAIStrategy


def test_deterministic_ai_plays_preset_moves():
    strategy = DeterministicAIStrategy(["0", "4", "8"])
    move1, _ = strategy.generate_move({})
    assert move1 == "0"
    move2, _ = strategy.generate_move({})
    assert move2 == "4"
    move3, _ = strategy.generate_move({})
    assert move3 == "8"


def test_deterministic_ai_raises_when_exhausted():
    strategy = DeterministicAIStrategy(["0"])
    strategy.generate_move({})
    with pytest.raises(ValueError, match="exhausted"):
        strategy.generate_move({})


def test_deterministic_ai_returns_none_eval():
    strategy = DeterministicAIStrategy(["5"])
    _, eval_ = strategy.generate_move({})
    assert eval_ is None


def test_deterministic_ai_per_request_isolation():
    s1 = DeterministicAIStrategy(["0", "1"])
    s2 = DeterministicAIStrategy(["8", "7"])
    m1, _ = s1.generate_move({})
    m2, _ = s2.generate_move({})
    assert m1 == "0"
    assert m2 == "8"
    m1b, _ = s1.generate_move({})
    m2b, _ = s2.generate_move({})
    assert m1b == "1"
    assert m2b == "7"


def test_deterministic_ai_empty_list_raises():
    strategy = DeterministicAIStrategy([])
    with pytest.raises(ValueError, match="exhausted"):
        strategy.generate_move({})


def test_deterministic_ai_ignored_in_production():
    import games

    class FakeStrategy:
        def generate_move(self, state):
            return "real_move", 1.0

    default = FakeStrategy()
    with patch.object(games, "_is_test_env", False):
        result = games._resolve_strategy(default, {"x-ai-moves": "0,1,2"})
    assert result is default


def test_deterministic_ai_ignored_in_development():
    import games

    class FakeStrategy:
        def generate_move(self, state):
            return "real_move", 1.0

    default = FakeStrategy()
    with patch.object(games, "_is_test_env", False):
        result = games._resolve_strategy(default, {"x-ai-moves": "5,6,7"})
    assert result is default
