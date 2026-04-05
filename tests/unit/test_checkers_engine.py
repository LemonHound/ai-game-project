import pytest

from game_engine.checkers_engine import CheckersAIStrategy, CheckersEngine


@pytest.fixture
def engine():
    return CheckersEngine()


@pytest.fixture
def fresh_state(engine):
    return engine.initial_state(player_starts=True)


def test_checkers_initial_state_12_pieces_per_side(engine, fresh_state):
    board = fresh_state["board"]
    assert sum(1 for p in board if p == "R") == 12
    assert sum(1 for p in board if p == "B") == 12


def test_checkers_initial_state_structure(engine, fresh_state):
    assert fresh_state["current_turn"] == "player"
    assert fresh_state["player_symbol"] == "R"
    assert fresh_state["ai_symbol"] == "B"
    assert fresh_state["game_active"] is True
    assert fresh_state["must_capture"] is None
    assert len(fresh_state["legal_pieces"]) > 0


def test_checkers_initial_state_ai_first(engine):
    state = engine.initial_state(player_starts=False)
    assert state["current_turn"] == "ai"
    assert state["player_symbol"] == "B"
    assert state["ai_symbol"] == "R"


def test_checkers_validate_move_game_inactive(engine, fresh_state):
    state = {**fresh_state, "game_active": False}
    move = {"from": 40, "to": 33}
    assert engine.validate_move(state, move) is False


def test_checkers_validate_move_missing_fields(engine, fresh_state):
    assert engine.validate_move(fresh_state, {"from": 40}) is False
    assert engine.validate_move(fresh_state, {"to": 33}) is False


def test_checkers_validate_move_valid(engine, fresh_state):
    legal = engine.get_legal_moves(fresh_state)
    assert len(legal) > 0
    assert engine.validate_move(fresh_state, legal[0]) is True


def test_checkers_apply_move_updates_board(engine, fresh_state):
    legal = engine.get_legal_moves(fresh_state)
    move = legal[0]
    new_state = engine.apply_move(fresh_state, move)
    assert new_state["board"][move["from"]] == "_"
    assert new_state["board"][move["to"]] in ("R", "r")


def test_checkers_is_terminal_not_at_start(engine, fresh_state):
    is_term, outcome = engine.is_terminal(fresh_state)
    assert is_term is False
    assert outcome is None


def test_checkers_is_terminal_no_pieces(engine, fresh_state):
    state = {**fresh_state, "board": ["_"] * 64}
    state["board"][0] = "R"
    is_term, outcome = engine.is_terminal(state)
    assert is_term is True
    assert outcome == "player_won"


def test_checkers_mandatory_jump_enforced(engine):
    board = ["_"] * 64
    board[28] = "R"
    board[21] = "B"
    state = {
        "board": board,
        "current_turn": "player",
        "game_active": True,
        "player_starts": True,
        "player_symbol": "R",
        "ai_symbol": "B",
        "must_capture": None,
        "last_move": None,
        "legal_pieces": [],
    }
    state["legal_pieces"] = engine._compute_legal_pieces(state)
    legal = engine.get_legal_moves(state)
    assert all(abs(m["from"] - m["to"]) > 9 for m in legal)


def test_checkers_king_promotion(engine):
    board = ["_"] * 64
    board[9] = "R"
    state = {
        "board": board,
        "current_turn": "player",
        "game_active": True,
        "player_starts": True,
        "player_symbol": "R",
        "ai_symbol": "B",
        "must_capture": None,
        "last_move": None,
        "legal_pieces": [],
    }
    state["legal_pieces"] = engine._compute_legal_pieces(state)
    legal = engine.get_legal_moves(state)
    king_moves = [m for m in legal if m["to"] < 8]
    if king_moves:
        new_state = engine.apply_move(state, king_moves[0])
        assert new_state["board"][king_moves[0]["to"]] == "r"
        assert new_state["last_move"]["is_king_promotion"] is True


def test_checkers_ai_returns_valid_move(engine, fresh_state):
    strategy = CheckersAIStrategy()
    ai_state = {**fresh_state, "current_turn": "ai"}
    ai_state["legal_pieces"] = engine._compute_legal_pieces(ai_state)
    move, eval_ = strategy.generate_move(ai_state)
    assert move["from"] >= 0
    assert move["to"] >= 0
