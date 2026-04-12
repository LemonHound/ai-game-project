import pytest

from game_engine.chess_engine import ChessAIStrategy, ChessEngine


@pytest.fixture
def engine():
    return ChessEngine()


@pytest.fixture
def fresh_state(engine):
    return engine.initial_state(player_starts=True)


def test_chess_initial_state_has_32_pieces(engine):
    state = engine.initial_state(player_starts=True)
    board = state["board"]
    piece_count = sum(
        1 for row in board for cell in row if cell is not None
    )
    assert piece_count == 32


def test_chess_initial_state_structure(engine, fresh_state):
    assert fresh_state["current_player"] == "white"
    assert fresh_state["player_color"] == "white"
    assert fresh_state["game_active"] is True
    assert fresh_state["king_positions"] == {"white": [7, 4], "black": [0, 4]}
    assert fresh_state["castling_rights"]["white"]["kingside"] is True
    assert fresh_state["en_passant_target"] is None
    assert fresh_state["in_check"] is False


def test_chess_initial_state_ai_first(engine):
    state = engine.initial_state(player_starts=False)
    assert state["player_color"] == "black"
    assert state["current_player"] == "white"


def test_chess_pawn_cannot_move_backward(engine, fresh_state):
    move = {"fromRow": 6, "fromCol": 4, "toRow": 7, "toCol": 4}
    assert engine.validate_move(fresh_state, move) is False


def test_chess_pawn_can_move_forward_one(engine, fresh_state):
    move = {"fromRow": 6, "fromCol": 4, "toRow": 5, "toCol": 4}
    assert engine.validate_move(fresh_state, move) is True


def test_chess_pawn_can_move_forward_two(engine, fresh_state):
    move = {"fromRow": 6, "fromCol": 4, "toRow": 4, "toCol": 4}
    assert engine.validate_move(fresh_state, move) is True


def test_chess_validate_move_wrong_color(engine, fresh_state):
    move = {"fromRow": 1, "fromCol": 4, "toRow": 3, "toCol": 4}
    assert engine.validate_move(fresh_state, move) is False


def test_chess_validate_move_empty_square(engine, fresh_state):
    move = {"fromRow": 4, "fromCol": 4, "toRow": 3, "toCol": 4}
    assert engine.validate_move(fresh_state, move) is False


def test_chess_validate_move_game_inactive(engine, fresh_state):
    state = {**fresh_state, "game_active": False}
    move = {"fromRow": 6, "fromCol": 4, "toRow": 4, "toCol": 4}
    assert engine.validate_move(state, move) is False


def test_chess_apply_move_pawn_forward(engine, fresh_state):
    move = {"fromRow": 6, "fromCol": 4, "toRow": 4, "toCol": 4}
    new_state = engine.apply_move(fresh_state, move)
    assert new_state["board"][4][4] == "P"
    assert new_state["board"][6][4] is None
    assert new_state["current_player"] == "black"


def test_chess_apply_move_does_not_mutate(engine, fresh_state):
    import copy
    original = copy.deepcopy(fresh_state)
    move = {"fromRow": 6, "fromCol": 4, "toRow": 4, "toCol": 4}
    engine.apply_move(fresh_state, move)
    assert fresh_state == original


def test_chess_is_terminal_not_at_start(engine, fresh_state):
    is_term, outcome = engine.is_terminal(fresh_state)
    assert is_term is False
    assert outcome is None


def test_chess_checkmate_is_terminal(engine, fresh_state):
    import copy
    state = copy.deepcopy(fresh_state)
    state["board"] = [[None]*8 for _ in range(8)]
    state["board"][0][4] = "k"
    state["board"][0][0] = "R"
    state["board"][1][0] = "R"
    state["board"][7][4] = "K"
    state["king_positions"] = {"white": [7, 4], "black": [0, 4]}
    state["current_player"] = "black"
    state["castling_rights"] = {
        "white": {"kingside": False, "queenside": False},
        "black": {"kingside": False, "queenside": False},
    }
    is_term, outcome = engine.is_terminal(state)
    assert is_term is True
    assert outcome in ("player_won", "ai_won")


def test_chess_get_legal_moves_initial(engine, fresh_state):
    moves = engine.get_legal_moves(fresh_state)
    assert len(moves) == 20


def test_chess_get_legal_moves_format(engine, fresh_state):
    moves = engine.get_legal_moves(fresh_state)
    for m in moves:
        assert "fromRow" in m
        assert "fromCol" in m
        assert "toRow" in m
        assert "toCol" in m


def test_chess_ai_returns_legal_move(engine, fresh_state):
    strategy = ChessAIStrategy()
    ai_state = {**fresh_state, "current_player": "black", "player_color": "white"}
    move, eval_ = strategy.generate_move(ai_state)
    assert engine.validate_move(ai_state, move) is True
    assert eval_ is not None
    assert -1.0 <= eval_ <= 1.0


def test_chess_move_stores_fen(engine, fresh_state):
    import re

    move = {"fromRow": 6, "fromCol": 4, "toRow": 4, "toCol": 4}
    new_state = engine.apply_move(fresh_state, move)
    fen = new_state.get("fen")
    assert fen is not None, "state['fen'] must be set after apply_move"
    parts = fen.split(" ")
    assert len(parts) == 6, f"FEN must have 6 space-separated fields, got: {fen}"
    assert parts[1] in ("w", "b"), f"Active color must be 'w' or 'b', got: {parts[1]}"
    assert re.match(r"^[KQRBNPkqrbnp1-8/]+$", parts[0]), f"Piece placement invalid: {parts[0]}"
