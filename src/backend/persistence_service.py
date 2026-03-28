import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from opentelemetry import metrics, trace
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from db_models import GAME_TYPE_TO_MOVE_MODEL, GameSession

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)
meter = metrics.get_meter(__name__)
_sessions_started = meter.create_counter("game.sessions.started", description="Game sessions started")
_sessions_completed = meter.create_counter("game.sessions.completed", description="Game sessions completed")

_STALE_DAYS = 30


async def get_or_create_game_session(
    session: AsyncSession, user_id: int, game_type: str, difficulty: str = "medium"
) -> GameSession:
    with tracer.start_as_current_span("persistence.get_or_create_game_session") as span:
        span.set_attribute("game.type", game_type)
        span.set_attribute("user.id", user_id)

        cutoff = datetime.now(timezone.utc) - timedelta(days=_STALE_DAYS)

        result = await session.execute(
            select(GameSession).where(
                GameSession.user_id == user_id,
                GameSession.game_type == game_type,
                GameSession.game_ended.is_(False),
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            if existing.last_move_at.replace(tzinfo=timezone.utc) < cutoff:
                existing.game_ended = True
                existing.game_abandoned = True
                session.add(existing)
                await session.commit()
            else:
                return existing

        new_session = GameSession(
            user_id=user_id, game_type=game_type, difficulty=difficulty
        )
        session.add(new_session)
        await session.commit()
        await session.refresh(new_session)
        _sessions_started.add(1, {"game.type": game_type})
        return new_session


async def record_move(
    session: AsyncSession,
    session_id: UUID,
    game_type: str,
    player: str,
    move: dict,
    board_state_after: dict,
    engine_eval: Optional[float] = None,
) -> None:
    with tracer.start_as_current_span("persistence.record_move") as span:
        span.set_attribute("game.session_id", str(session_id))
        span.set_attribute("game.player", player)

        MoveModel = GAME_TYPE_TO_MOVE_MODEL[game_type]

        count_result = await session.execute(
            select(func.count()).select_from(MoveModel).where(
                MoveModel.session_id == session_id
            )
        )
        move_number = (count_result.scalar() or 0) + 1

        move_record = MoveModel(
            session_id=session_id,
            move_number=move_number,
            player=player,
            move=move,
            board_state_after=board_state_after,
            engine_eval=engine_eval,
        )
        session.add(move_record)

        await session.execute(
            update(GameSession)
            .where(GameSession.id == session_id)
            .values(last_move_at=datetime.now(timezone.utc))
        )

        await session.commit()


async def end_game_session(
    session: AsyncSession, session_id: UUID, outcome: str, game_type: str = ""
) -> None:
    with tracer.start_as_current_span("persistence.end_game_session") as span:
        span.set_attribute("game.session_id", str(session_id))
        span.set_attribute("game.outcome", outcome)

        values: dict = {"game_ended": True}
        if outcome == "player_won":
            values["player_won"] = True
        elif outcome == "ai_won":
            values["ai_won"] = True
        elif outcome == "draw":
            values["is_draw"] = True
        elif outcome == "abandoned":
            values["game_abandoned"] = True

        await session.execute(
            update(GameSession).where(GameSession.id == session_id).values(**values)
        )
        await session.commit()
        attrs: dict = {"game.outcome": outcome}
        if game_type:
            attrs["game.type"] = game_type
        _sessions_completed.add(1, attrs)


async def get_game_session_state(
    session: AsyncSession, session_id: UUID
) -> Optional[GameSession]:
    result = await session.execute(
        select(GameSession).where(GameSession.id == session_id)
    )
    return result.scalar_one_or_none()


async def get_active_game_sessions(
    session: AsyncSession, user_id: int
) -> list[GameSession]:
    result = await session.execute(
        select(GameSession).where(
            GameSession.user_id == user_id,
            GameSession.game_ended.is_(False),
        )
    )
    return list(result.scalars().all())


async def get_latest_board_state(
    session: AsyncSession, session_id: UUID, game_type: str
) -> Optional[dict]:
    MoveModel = GAME_TYPE_TO_MOVE_MODEL.get(game_type)
    if not MoveModel:
        return None
    result = await session.execute(
        select(MoveModel.board_state_after)
        .where(MoveModel.session_id == session_id)
        .order_by(MoveModel.move_number.desc())
        .limit(1)
    )
    row = result.first()
    return row[0] if row else None


async def get_active_session_by_user_game(
    session: AsyncSession, user_id: int, game_type: str
) -> Optional[GameSession]:
    result = await session.execute(
        select(GameSession).where(
            GameSession.user_id == user_id,
            GameSession.game_type == game_type,
            GameSession.game_ended.is_(False),
        )
    )
    return result.scalar_one_or_none()


async def close_session(session: AsyncSession, session_id: UUID) -> None:
    await session.execute(
        update(GameSession)
        .where(GameSession.id == session_id)
        .values(game_ended=True, game_abandoned=True)
    )
    await session.commit()


async def create_game_session(
    session: AsyncSession, user_id: int, game_type: str
) -> GameSession:
    new_session = GameSession(user_id=user_id, game_type=game_type)
    session.add(new_session)
    await session.commit()
    await session.refresh(new_session)
    _sessions_started.add(1, {"game.type": game_type})
    return new_session


async def cleanup_stale_sessions(
    session: AsyncSession, game_type: str, timeout_hours: int
) -> int:
    from sqlalchemy import text as sa_text

    result = await session.execute(
        sa_text("""
            UPDATE game_sessions
            SET game_ended = true, game_abandoned = true
            WHERE game_type = :game_type
              AND NOT game_ended
              AND last_move_at < NOW() - (:timeout_hours || ' hours')::interval
            RETURNING id
        """),
        {"game_type": game_type, "timeout_hours": timeout_hours},
    )
    rows = result.fetchall()
    count = len(rows)
    await session.commit()
    if count:
        _sessions_completed.add(count, {"game.type": game_type, "game.outcome": "abandoned"})
        logger.info("cleanup_stale_sessions", extra={"game_type": game_type, "count": count})
    return count
