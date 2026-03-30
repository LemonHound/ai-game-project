import sys
import os
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../src/backend"))

import persistence_service
from db_models import TicTacToeGame


def _make_game(user_id: int, game_type: str = "tic_tac_toe", **kwargs) -> TicTacToeGame:
    return TicTacToeGame(
        id=uuid4(),
        user_id=user_id,
        board_state=kwargs.get("board_state", {"board": [None] * 9}),
        move_list=kwargs.get("move_list", []),
        game_ended=kwargs.get("game_ended", False),
        game_abandoned=kwargs.get("game_abandoned", False),
        is_draw=kwargs.get("is_draw", False),
        player_won=kwargs.get("player_won", False),
        ai_won=kwargs.get("ai_won", False),
        created_at=kwargs.get("created_at", datetime.now(timezone.utc).replace(tzinfo=None)),
        last_move_at=kwargs.get("last_move_at", datetime.now(timezone.utc).replace(tzinfo=None)),
    )


@pytest.mark.asyncio
async def test_create_game_sets_initial_state():
    db = AsyncMock()
    db.add = MagicMock()
    db.commit = AsyncMock()

    initial_state = {"board": [None] * 9, "current_turn": "player"}
    refreshed = _make_game(1, board_state=initial_state)
    db.refresh = AsyncMock(side_effect=lambda obj: setattr(obj, "id", refreshed.id) or None)

    record = await persistence_service.create_game(db, 1, "tic_tac_toe", initial_state)

    db.add.assert_called_once()
    db.commit.assert_called()
    added = db.add.call_args[0][0]
    assert added.user_id == 1
    assert added.board_state == initial_state
    assert added.move_list == []


@pytest.mark.asyncio
async def test_get_active_game_returns_existing():
    existing = _make_game(2)
    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = existing
    db.execute = AsyncMock(return_value=result_mock)

    returned = await persistence_service.get_active_game(db, 2, "tic_tac_toe")

    assert returned is existing


@pytest.mark.asyncio
async def test_get_active_game_returns_none_when_absent():
    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=result_mock)

    returned = await persistence_service.get_active_game(db, 99, "tic_tac_toe")

    assert returned is None


@pytest.mark.asyncio
async def test_get_active_game_expires_stale():
    stale_last_move = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=31)
    stale = _make_game(3, last_move_at=stale_last_move)

    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = stale
    db.execute = AsyncMock(return_value=result_mock)
    db.commit = AsyncMock()

    returned = await persistence_service.get_active_game(db, 3, "tic_tac_toe")

    assert returned is None
    db.execute.assert_called()
    db.commit.assert_called()


@pytest.mark.asyncio
async def test_record_move_appends_notation():
    game_id = uuid4()
    db = AsyncMock()
    db.execute = AsyncMock()
    db.commit = AsyncMock()

    await persistence_service.record_move(
        db,
        game_id,
        "tic_tac_toe",
        "4",
        {"board": [None] * 9, "current_turn": "ai"},
    )

    db.execute.assert_called_once()
    db.commit.assert_called_once()
    stmt = db.execute.call_args[0][0]
    assert stmt is not None


@pytest.mark.asyncio
async def test_end_game_sets_flags():
    game_id = uuid4()
    db = AsyncMock()
    db.execute = AsyncMock()
    db.commit = AsyncMock()

    await persistence_service.end_game(db, game_id, "tic_tac_toe", "player_won")

    db.execute.assert_called_once()
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_end_game_draw():
    game_id = uuid4()
    db = AsyncMock()
    db.execute = AsyncMock()
    db.commit = AsyncMock()

    await persistence_service.end_game(db, game_id, "tic_tac_toe", "draw")

    db.execute.assert_called_once()
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_close_game_marks_abandoned():
    game_id = uuid4()
    db = AsyncMock()
    db.execute = AsyncMock()
    db.commit = AsyncMock()

    await persistence_service.close_game(db, game_id, "tic_tac_toe")

    db.execute.assert_called_once()
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_get_all_active_games_returns_list():
    chess_game = _make_game(1)
    ttt_game = _make_game(1)

    db = AsyncMock()
    call_count = 0

    def make_result(record):
        m = MagicMock()
        m.scalar_one_or_none.return_value = record
        return m

    game_types = list(__import__("db_models").GAME_TYPE_TO_MODEL.keys())

    results_by_type = {
        "chess": chess_game,
        "tic_tac_toe": ttt_game,
    }

    def execute_side_effect(*args, **kwargs):
        nonlocal call_count
        idx = call_count
        call_count += 1
        gt = game_types[idx] if idx < len(game_types) else None
        return make_result(results_by_type.get(gt))

    db.execute = AsyncMock(side_effect=execute_side_effect)

    active = await persistence_service.get_all_active_games(db, 1)

    assert len(active) == 2
    game_type_names = {gt for gt, _ in active}
    assert "chess" in game_type_names
    assert "tic_tac_toe" in game_type_names
