import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from opentelemetry import metrics, trace
from sqlalchemy import func, select, text as sa_text, update
from sqlalchemy.ext.asyncio import AsyncSession

from db_models import GAME_TYPE_TO_MODEL, GameRecord

logger = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)
meter = metrics.get_meter(__name__)
_sessions_started = meter.create_counter("game.sessions.started", description="Game sessions started")
_sessions_completed = meter.create_counter("game.sessions.completed", description="Game sessions completed")

_STALE_DAYS = 30


async def get_active_game(
    session: AsyncSession, user_id: int, game_type: str
) -> Optional[GameRecord]:
    with tracer.start_as_current_span("persistence.get_active_game") as span:
        span.set_attribute("game.type", game_type)
        span.set_attribute("user.id", user_id)

        Model = GAME_TYPE_TO_MODEL[game_type]
        cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=_STALE_DAYS)

        result = await session.execute(
            select(Model).where(
                Model.user_id == user_id,
                Model.game_ended.is_(False),
            )
        )
        existing = result.scalar_one_or_none()

        if not existing:
            return None

        if existing.last_move_at < cutoff:
            await session.execute(
                update(Model)
                .where(Model.id == existing.id)
                .values(game_ended=True, game_abandoned=True)
            )
            await session.commit()
            return None

        return existing


async def create_game(
    session: AsyncSession, user_id: int, game_type: str, initial_board_state: dict
) -> GameRecord:
    with tracer.start_as_current_span("persistence.create_game") as span:
        span.set_attribute("game.type", game_type)
        span.set_attribute("user.id", user_id)

        Model = GAME_TYPE_TO_MODEL[game_type]
        record = Model(
            user_id=user_id,
            board_state=initial_board_state,
            move_list=[],
        )
        session.add(record)
        await session.commit()
        await session.refresh(record)
        _sessions_started.add(1, {"game.type": game_type})
        return record


async def record_move(
    session: AsyncSession,
    game_id: UUID,
    game_type: str,
    move_notation: str,
    board_state_after: dict,
) -> None:
    with tracer.start_as_current_span("persistence.record_move") as span:
        span.set_attribute("game.id", str(game_id))
        span.set_attribute("game.type", game_type)

        Model = GAME_TYPE_TO_MODEL[game_type]
        await session.execute(
            update(Model)
            .where(Model.id == game_id)
            .values(
                board_state=board_state_after,
                move_list=func.array_append(Model.move_list, move_notation),
                last_move_at=datetime.now(timezone.utc).replace(tzinfo=None),
            )
        )
        await session.commit()


async def end_game(
    session: AsyncSession, game_id: UUID, game_type: str, outcome: str
) -> None:
    with tracer.start_as_current_span("persistence.end_game") as span:
        span.set_attribute("game.id", str(game_id))
        span.set_attribute("game.type", game_type)
        span.set_attribute("game.outcome", outcome)

        Model = GAME_TYPE_TO_MODEL[game_type]
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
            update(Model).where(Model.id == game_id).values(**values)
        )
        await session.commit()
        _sessions_completed.add(1, {"game.type": game_type, "game.outcome": outcome})


async def get_game(
    session: AsyncSession, game_id: UUID, game_type: str
) -> Optional[GameRecord]:
    Model = GAME_TYPE_TO_MODEL[game_type]
    result = await session.execute(select(Model).where(Model.id == game_id))
    return result.scalar_one_or_none()


async def get_all_active_games(
    session: AsyncSession, user_id: int
) -> list[tuple[str, GameRecord]]:
    results = []
    for game_type, Model in GAME_TYPE_TO_MODEL.items():
        result = await session.execute(
            select(Model).where(
                Model.user_id == user_id,
                Model.game_ended.is_(False),
            )
        )
        record = result.scalar_one_or_none()
        if record:
            results.append((game_type, record))
    return results


async def close_game(session: AsyncSession, game_id: UUID, game_type: str) -> None:
    Model = GAME_TYPE_TO_MODEL[game_type]
    await session.execute(
        update(Model)
        .where(Model.id == game_id)
        .values(game_ended=True, game_abandoned=True)
    )
    await session.commit()


async def cleanup_stale_games(
    session: AsyncSession, game_type: str, timeout_hours: int
) -> int:
    Model = GAME_TYPE_TO_MODEL.get(game_type)
    if not Model:
        return 0

    table_name = Model.__tablename__
    result = await session.execute(
        sa_text(f"""
            UPDATE {table_name}
            SET game_ended = true, game_abandoned = true
            WHERE NOT game_ended
              AND last_move_at < NOW() - (:timeout_hours || ' hours')::interval
            RETURNING id
        """),
        {"timeout_hours": timeout_hours},
    )
    rows = result.fetchall()
    count = len(rows)
    await session.commit()
    if count:
        _sessions_completed.add(count, {"game.type": game_type, "game.outcome": "abandoned"})
        logger.info("cleanup_stale_games", extra={"game_type": game_type, "count": count})
    return count
