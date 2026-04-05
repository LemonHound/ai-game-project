import pytest

from game_engine.connect4_engine import Connect4AIStrategy, Connect4Engine


@pytest.fixture
def engine():
    return Connect4Engine()


@pytest.fixture
def fresh_state(engine):
    return engine.initial_state(player_starts=True)


def test_connect4_initial_state_empty(engine, fresh_state):
    board = fresh_state["board"]
    assert len(board) == 6
    assert all(len(row) == 7 for row in board)
    assert all(cell is None for row in board for cell in row)


def test_connect4_initial_state_structure(engine, fresh_state):
    assert fresh_state["current_turn"] == "player"
    assert fresh_state["game_active"] is True
    assert fresh_state["move_count"] == 0
    assert fresh_state["last_move"] is None


def test_connect4_validate_move_valid(engine, fresh_state):
    assert engine.validate_move(fresh_state, {"col": 0}) is True
    assert engine.validate_move(fresh_state, {"col": 6}) is True


def test_connect4_validate_move_out_of_range(engine, fresh_state):
    assert engine.validate_move(fresh_state, {"col": -1}) is False
    assert engine.validate_move(fresh_state, {"col": 7}) is False


def test_connect4_validate_move_game_inactive(engine, fresh_state):
    state = {**fresh_state, "game_active": False}
    assert engine.validate_move(state, {"col": 0}) is False


def test_connect4_column_full_rejected(engine, fresh_state):
    import copy
    state = copy.deepcopy(fresh_state)
    for row in range(6):
        state["board"][row][3] = "player"
    assert engine.validate_move(state, {"col": 3}) is False


def test_connect4_apply_move_stacks_at_bottom(engine, fresh_state):
    new_state = engine.apply_move(fresh_state, {"col": 3})
    assert new_state["board"][5][3] == "player"
    assert new_state["current_turn"] == "ai"
    assert new_state["move_count"] == 1


def test_connect4_apply_move_stacks_correctly(engine, fresh_state):
    state = engine.apply_move(fresh_state, {"col": 3})
    state = engine.apply_move(state, {"col": 3})
    assert state["board"][5][3] == "player"
    assert state["board"][4][3] == "ai"


def test_connect4_vertical_win_detected(engine):
    import copy
    state = engine.initial_state(player_starts=True)
    state = copy.deepcopy(state)
    for i in range(3):
        state["board"][5 - i][0] = "player"
    state["move_count"] = 6
    state["last_move"] = {"row": 3, "col": 0, "player": "player"}
    state["board"][2][0] = "player"
    is_term, outcome = engine.is_terminal(state)
    assert is_term is True
    assert outcome == "player_won"


def test_connect4_diagonal_win_detected(engine):
    import copy
    state = engine.initial_state(player_starts=True)
    state = copy.deepcopy(state)
    state["board"][5][0] = "player"
    state["board"][4][1] = "player"
    state["board"][3][2] = "player"
    state["board"][2][3] = "player"
    state["move_count"] = 7
    state["last_move"] = {"row": 2, "col": 3, "player": "player"}
    is_term, outcome = engine.is_terminal(state)
    assert is_term is True
    assert outcome == "player_won"


def test_connect4_horizontal_win_detected(engine):
    import copy
    state = engine.initial_state(player_starts=True)
    state = copy.deepcopy(state)
    for c in range(4):
        state["board"][5][c] = "player"
    state["move_count"] = 7
    state["last_move"] = {"row": 5, "col": 3, "player": "player"}
    is_term, outcome = engine.is_terminal(state)
    assert is_term is True
    assert outcome == "player_won"


def test_connect4_draw_detection(engine):
    import copy
    state = engine.initial_state(player_starts=True)
    state = copy.deepcopy(state)
    for r in range(6):
        for c in range(7):
            state["board"][r][c] = "player" if (r + c) % 2 == 0 else "ai"
    state["move_count"] = 42
    state["last_move"] = {"row": 0, "col": 6, "player": "player"}
    is_term, outcome = engine.is_terminal(state)
    if not is_term:
        assert outcome is None
    else:
        assert outcome in ("draw", "player_won", "ai_won")


def test_connect4_not_terminal_at_start(engine, fresh_state):
    is_term, outcome = engine.is_terminal(fresh_state)
    assert is_term is False
    assert outcome is None


def test_connect4_get_legal_moves_initial(engine, fresh_state):
    moves = engine.get_legal_moves(fresh_state)
    assert len(moves) == 7
    assert all(m["col"] in range(7) for m in moves)


def test_connect4_ai_returns_valid_move(engine, fresh_state):
    strategy = Connect4AIStrategy()
    ai_state = {**fresh_state, "current_turn": "ai"}
    move, eval_ = strategy.generate_move(ai_state)
    assert 0 <= move["col"] <= 6
    assert engine.validate_move(ai_state, move) is True
