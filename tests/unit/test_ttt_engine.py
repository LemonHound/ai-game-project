import pytest

from game_engine.base import MoveProcessor, StatusBroadcaster, StatusEvent
from game_engine.ttt_engine import TicTacToeAIStrategy, TicTacToeEngine, WINNING_LINES


@pytest.fixture
def engine():
    return TicTacToeEngine()


@pytest.fixture
def fresh_state(engine):
    return engine.initial_state(player_starts=True)


# ---------------------------------------------------------------------------
# GameEngine — validate_move
# ---------------------------------------------------------------------------


def test_ttt_engine_validate_move_occupied_cell(engine, fresh_state):
    state = fresh_state.copy()
    state["board"] = list(fresh_state["board"])
    state["board"][4] = "X"
    assert engine.validate_move(state, 4) is False


def test_ttt_engine_validate_move_out_of_range(engine, fresh_state):
    assert engine.validate_move(fresh_state, -1) is False
    assert engine.validate_move(fresh_state, 9) is False


def test_ttt_engine_validate_move_valid(engine, fresh_state):
    assert engine.validate_move(fresh_state, 0) is True
    assert engine.validate_move(fresh_state, 8) is True


def test_ttt_engine_validate_move_not_player_turn(engine, fresh_state):
    # validate_move is turn-agnostic; turn enforcement is in process_player_move
    processor = MoveProcessor()
    state = {**fresh_state, "current_turn": "ai"}
    with pytest.raises(ValueError, match="Not player's turn"):
        processor.process_player_move(engine, state, 0)


def test_ttt_engine_validate_move_game_over(engine, fresh_state):
    state = {**fresh_state, "status": "complete"}
    assert engine.validate_move(state, 0) is False


# ---------------------------------------------------------------------------
# GameEngine — is_terminal
# ---------------------------------------------------------------------------


def test_ttt_engine_is_terminal_detects_all_win_lines(engine, fresh_state):
    for line in WINNING_LINES:
        board = [None] * 9
        for pos in line:
            board[pos] = "X"
        state = {**fresh_state, "board": board}
        terminal, outcome, _ = engine._check_terminal(board)
        assert terminal is True
        assert outcome == "X"


def test_ttt_engine_is_terminal_draw(engine, fresh_state):
    board = ["X", "O", "X", "X", "O", "X", "O", "X", "O"]
    state = {**fresh_state, "board": board}
    is_term, outcome = engine.is_terminal(state)
    assert is_term is True
    assert outcome == "draw"


def test_ttt_engine_is_terminal_in_progress(engine, fresh_state):
    is_term, outcome = engine.is_terminal(fresh_state)
    assert is_term is False
    assert outcome is None


# ---------------------------------------------------------------------------
# GameEngine — get_legal_moves
# ---------------------------------------------------------------------------


def test_ttt_engine_get_legal_moves_returns_empty_cells_only(engine, fresh_state):
    board = ["X", None, "O", None, "X", None, None, None, "O"]
    state = {**fresh_state, "board": board}
    legal = engine.get_legal_moves(state)
    assert sorted(legal) == [1, 3, 5, 6, 7]


def test_ttt_engine_get_legal_moves_empty_board(engine, fresh_state):
    assert engine.get_legal_moves(fresh_state) == list(range(9))


# ---------------------------------------------------------------------------
# GameEngine — apply_move
# ---------------------------------------------------------------------------


def test_ttt_engine_apply_move_updates_board(engine, fresh_state):
    result = engine.apply_move(fresh_state, 4)
    assert result["board"][4] == fresh_state["player_symbol"]
    assert result["current_turn"] == "ai"


def test_ttt_engine_apply_move_terminal_sets_status(engine, fresh_state):
    board = ["X", "X", None, "O", "O", None, None, None, None]
    state = {**fresh_state, "board": board}
    result = engine.apply_move(state, 2)
    assert result["status"] == "complete"
    assert result["winner"] == "X"
    assert result["winning_positions"] == [0, 1, 2]


# ---------------------------------------------------------------------------
# MoveProcessor
# ---------------------------------------------------------------------------


def test_move_processor_player_invalid_move_returns_error(engine, fresh_state):
    processor = MoveProcessor()
    with pytest.raises(ValueError):
        processor.process_player_move(engine, fresh_state, 9)


def test_move_processor_ai_invalid_move_retries(engine, fresh_state, caplog):
    import logging

    class BadStrategy:
        _calls = 0

        def generate_move(self, state):
            self._calls += 1
            if self._calls < 3:
                return -1, None
            return 0, 0.5

    strategy = BadStrategy()
    processor = MoveProcessor()
    with caplog.at_level(logging.WARNING):
        result, eval_ = processor.process_ai_turn(engine, strategy, fresh_state, max_retries=5)
    assert result["board"][0] == fresh_state["ai_symbol"]
    assert strategy._calls == 3
    assert any("ai_invalid_move" in r.message for r in caplog.records)


def test_move_processor_ai_fallback_after_max_retries(engine, fresh_state, caplog):
    import logging

    class AlwaysBadStrategy:
        def generate_move(self, state):
            return -1, None

    strategy = AlwaysBadStrategy()
    processor = MoveProcessor()
    with caplog.at_level(logging.WARNING):
        result, eval_ = processor.process_ai_turn(engine, strategy, fresh_state, max_retries=3)
    assert None not in [result["board"][i] for i in [result["board"].index(fresh_state["ai_symbol"])]]
    assert any("fallback" in r.message for r in caplog.records)


# ---------------------------------------------------------------------------
# StatusBroadcaster
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_status_broadcaster_closes_on_terminal_event():
    broadcaster = StatusBroadcaster()
    broadcaster.emit(StatusEvent("move", payload={"status": "complete"}))
    events = []
    async for chunk in broadcaster.stream():
        events.append(chunk)
        break
    assert any('"status": "complete"' in e or '"status":"complete"' in e for e in events)


@pytest.mark.asyncio
async def test_status_broadcaster_emits_heartbeat():
    import asyncio

    broadcaster = StatusBroadcaster()
    broadcaster.MIN_INTERVAL = 0
    broadcaster.HEARTBEAT_INTERVAL = 0.05

    received = []

    async def collect():
        async for chunk in broadcaster.stream():
            received.append(chunk)
            if len(received) >= 1:
                broadcaster.close()
                break

    await asyncio.wait_for(collect(), timeout=1.0)
    assert any('"heartbeat"' in e for e in received)


# ---------------------------------------------------------------------------
# engine_eval normalization
# ---------------------------------------------------------------------------


def test_ttt_initial_state_is_empty_3x3(engine):
    state = engine.initial_state(player_starts=True)
    assert len(state["board"]) == 9
    assert all(cell is None for cell in state["board"])
    assert state["current_turn"] == "player"
    assert state["player_symbol"] == "X"
    assert state["ai_symbol"] == "O"
    assert state["status"] == "in_progress"


def test_ttt_initial_state_ai_first(engine):
    state = engine.initial_state(player_starts=False)
    assert state["current_turn"] == "ai"
    assert state["player_symbol"] == "O"
    assert state["ai_symbol"] == "X"


def test_ttt_apply_move_sets_correct_cell(engine, fresh_state):
    new_state = engine.apply_move(fresh_state, 4)
    assert new_state["board"][4] == "X"
    assert sum(cell is not None for cell in new_state["board"]) == 1


def test_ttt_is_terminal_detects_row_win(engine, fresh_state):
    board = ["X", "X", "X", None, "O", "O", None, None, None]
    state = {**fresh_state, "board": board}
    is_term, outcome = engine.is_terminal(state)
    assert is_term is True
    assert outcome == "X"


def test_ttt_ai_returns_legal_move(engine, fresh_state):
    strategy = TicTacToeAIStrategy()
    ai_state = {**fresh_state, "current_turn": "ai"}
    move, _ = strategy.generate_move(ai_state)
    legal = engine.get_legal_moves(ai_state)
    assert move in legal


def test_engine_eval_normalization():
    strategy = TicTacToeAIStrategy()
    engine = TicTacToeEngine()
    state = engine.initial_state(player_starts=True)
    _, eval_ = strategy.generate_move(state)
    assert eval_ is not None
    assert -1.0 <= eval_ <= 1.0
