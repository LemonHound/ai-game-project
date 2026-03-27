import sys
import os
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../src/backend"))

import persistence_service
from db_models import GameSession


def _make_session(user_id: int, game_type: str, **kwargs) -> GameSession:
    return GameSession(
        id=uuid4(),
        user_id=user_id,
        game_type=game_type,
        difficulty=kwargs.get("difficulty", "medium"),
        game_ended=kwargs.get("game_ended", False),
        game_abandoned=kwargs.get("game_abandoned", False),
        is_draw=kwargs.get("is_draw", False),
        player_won=kwargs.get("player_won", False),
        ai_won=kwargs.get("ai_won", False),
        started_at=kwargs.get("started_at", datetime.now(timezone.utc)),
        last_move_at=kwargs.get("last_move_at", datetime.now(timezone.utc)),
    )


@pytest.mark.asyncio
async def test_get_or_create_game_session_creates_new():
    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=result_mock)
    db.add = MagicMock()
    db.commit = AsyncMock()

    refreshed = _make_session(1, "tic_tac_toe")
    db.refresh = AsyncMock(side_effect=lambda obj: setattr(obj, "id", refreshed.id) or None)

    session = await persistence_service.get_or_create_game_session(db, 1, "tic_tac_toe", "medium")

    db.add.assert_called_once()
    db.commit.assert_called()
    assert session.user_id == 1
    assert session.game_type == "tic_tac_toe"
    assert session.game_ended is False


@pytest.mark.asyncio
async def test_get_or_create_game_session_returns_existing():
    existing = _make_session(2, "chess")
    db = AsyncMock()
    result_mock = MagicMock()
    result_mock.scalar_one_or_none.return_value = existing
    db.execute = AsyncMock(return_value=result_mock)

    returned = await persistence_service.get_or_create_game_session(db, 2, "chess")

    assert returned is existing
    db.add.assert_not_called()


@pytest.mark.asyncio
async def test_get_or_create_game_session_expires_stale():
    stale_last_move = datetime.now(timezone.utc) - timedelta(days=31)
    stale = _make_session(3, "checkers", last_move_at=stale_last_move)
    db = AsyncMock()

    call_count = 0
    results = []

    stale_result = MagicMock()
    stale_result.scalar_one_or_none.return_value = stale

    new_result = MagicMock()
    new_result.scalar_one_or_none.return_value = None

    def execute_side_effect(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return stale_result
        return new_result

    db.execute = AsyncMock(side_effect=execute_side_effect)
    db.add = MagicMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()

    await persistence_service.get_or_create_game_session(db, 3, "checkers")

    assert stale.game_ended is True
    assert stale.game_abandoned is True
    assert db.add.call_count >= 1


@pytest.mark.asyncio
async def test_record_move_inserts_row():
    session_id = uuid4()
    db = AsyncMock()

    count_result = MagicMock()
    count_result.scalar.return_value = 2
    db.execute = AsyncMock(return_value=count_result)
    db.add = MagicMock()
    db.commit = AsyncMock()

    await persistence_service.record_move(
        db,
        session_id,
        "tic_tac_toe",
        "human",
        {"position": 4},
        {"board": [None] * 9, "current_player": "O"},
    )

    db.add.assert_called_once()
    added = db.add.call_args[0][0]
    assert added.session_id == session_id
    assert added.move_number == 3
    assert added.player == "human"
    assert added.move == {"position": 4}
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_end_game_session_sets_flags():
    session_id = uuid4()
    db = AsyncMock()
    db.execute = AsyncMock()
    db.commit = AsyncMock()

    await persistence_service.end_game_session(db, session_id, "player_won")

    db.execute.assert_called_once()
    call_kwargs = db.execute.call_args
    stmt = call_kwargs[0][0]
    assert stmt is not None
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_end_game_session_draw():
    session_id = uuid4()
    db = AsyncMock()
    db.execute = AsyncMock()
    db.commit = AsyncMock()

    await persistence_service.end_game_session(db, session_id, "draw")

    db.execute.assert_called_once()
    db.commit.assert_called_once()


@pytest.mark.asyncio
async def test_get_active_game_sessions_returns_list():
    sessions = [_make_session(1, "chess"), _make_session(1, "connect4")]
    db = AsyncMock()
    result_mock = MagicMock()
    scalars_mock = MagicMock()
    scalars_mock.all.return_value = sessions
    result_mock.scalars.return_value = scalars_mock
    db.execute = AsyncMock(return_value=result_mock)

    returned = await persistence_service.get_active_game_sessions(db, 1)

    assert len(returned) == 2
    assert all(not s.game_ended for s in returned)
