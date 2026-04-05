import pytest

from game_engine.dab_engine import DaBEngine, DaBStrategy


@pytest.fixture
def engine():
    return DaBEngine()


@pytest.fixture
def fresh_state(engine):
    return engine.initial_state(player_starts=True)


def test_dab_initial_state_empty(engine, fresh_state):
    assert fresh_state["grid_size"] == 4
    assert fresh_state["horizontal_lines"] == {}
    assert fresh_state["vertical_lines"] == {}
    assert fresh_state["boxes"] == {}
    assert fresh_state["player_score"] == 0
    assert fresh_state["ai_score"] == 0


def test_dab_initial_state_structure(engine, fresh_state):
    assert fresh_state["current_turn"] == "player"
    assert fresh_state["game_active"] is True
    assert fresh_state["move_count"] == 0


def test_dab_validate_move_valid(engine, fresh_state):
    move = {"type": "horizontal", "row": 0, "col": 0}
    assert engine.validate_move(fresh_state, move) is True


def test_dab_validate_move_game_inactive(engine, fresh_state):
    state = {**fresh_state, "game_active": False}
    move = {"type": "horizontal", "row": 0, "col": 0}
    assert engine.validate_move(state, move) is False


def test_dab_validate_move_duplicate_line(engine, fresh_state):
    move = {"type": "horizontal", "row": 0, "col": 0}
    state = engine.apply_move(fresh_state, move)
    state["current_turn"] = "player"
    assert engine.validate_move(state, move) is False


def test_dab_apply_move_draws_line(engine, fresh_state):
    move = {"type": "horizontal", "row": 0, "col": 0}
    new_state = engine.apply_move(fresh_state, move)
    assert "0,0" in new_state["horizontal_lines"]


def test_dab_box_completion_awards_point(engine, fresh_state):
    state = fresh_state
    moves = [
        {"type": "horizontal", "row": 0, "col": 0},
        {"type": "horizontal", "row": 1, "col": 0},
        {"type": "vertical", "row": 0, "col": 0},
        {"type": "vertical", "row": 0, "col": 1},
    ]
    for i, move in enumerate(moves):
        state["current_turn"] = "player"
        state = engine.apply_move(state, move)
    assert state["player_score"] >= 1


def test_dab_extra_turn_on_box_completion(engine, fresh_state):
    state = fresh_state
    state["horizontal_lines"] = {"0,0": "player"}
    state["horizontal_lines"]["1,0"] = "player"
    state["vertical_lines"] = {"0,0": "player"}
    move = {"type": "vertical", "row": 0, "col": 1}
    new_state = engine.apply_move(state, move)
    assert new_state["current_turn"] == "player"


def test_dab_turn_switches_when_no_box(engine, fresh_state):
    move = {"type": "horizontal", "row": 0, "col": 0}
    new_state = engine.apply_move(fresh_state, move)
    assert new_state["current_turn"] == "ai"


def test_dab_is_terminal_not_at_start(engine, fresh_state):
    is_term, outcome = engine.is_terminal(fresh_state)
    assert is_term is False
    assert outcome is None


def test_dab_get_legal_moves_initial(engine, fresh_state):
    moves = engine.get_legal_moves(fresh_state)
    total_lines = 2 * 4 * (4 + 1)
    assert len(moves) == total_lines


def test_dab_get_legal_moves_decreases_after_move(engine, fresh_state):
    initial_count = len(engine.get_legal_moves(fresh_state))
    move = {"type": "horizontal", "row": 0, "col": 0}
    new_state = engine.apply_move(fresh_state, move)
    assert len(engine.get_legal_moves(new_state)) == initial_count - 1


def test_dab_ai_returns_valid_move(engine, fresh_state):
    strategy = DaBStrategy()
    ai_state = {**fresh_state, "current_turn": "ai"}
    move, eval_ = strategy.generate_move(ai_state)
    assert move["type"] in ("horizontal", "vertical")
    assert isinstance(move["row"], int)
    assert isinstance(move["col"], int)
