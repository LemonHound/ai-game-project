"""About page stats endpoint."""
import logging
import time
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from db import db_dependency
from db_models import GAME_TYPE_TO_MODEL

logger = logging.getLogger(__name__)

router = APIRouter()

LAUNCH_DATE = date(2025, 1, 1)

_cache: dict = {"data": None, "expires": 0.0}
_CACHE_TTL = 60


async def _query_stats(db: AsyncSession) -> dict:
    games_played = 0
    moves_analyzed = 0
    ai_wins = 0
    decided_games = 0

    for model in GAME_TYPE_TO_MODEL.values():
        row = (
            await db.execute(
                select(
                    func.count().filter(model.game_ended.is_(True)).label("played"),
                    func.coalesce(
                        func.sum(func.array_length(model.move_list, 1)),
                        0,
                    ).label("moves"),
                    func.count()
                    .filter(model.ai_won.is_(True))
                    .label("ai_wins"),
                    func.count()
                    .filter(
                        model.game_ended.is_(True),
                        model.is_draw.is_(False),
                    )
                    .label("decided"),
                ).select_from(model)
            )
        ).one()
        games_played += row.played
        moves_analyzed += row.moves
        ai_wins += row.ai_wins
        decided_games += row.decided

    unique_players_q = union_all(
        *(
            select(model.user_id).distinct()
            for model in GAME_TYPE_TO_MODEL.values()
        )
    ).subquery()
    unique_players = (
        await db.execute(
            select(func.count(unique_players_q.c.user_id.distinct()))
        )
    ).scalar_one()

    ai_win_rate = round(ai_wins / decided_games, 3) if decided_games > 0 else 0.0

    return {
        "games_played": games_played,
        "moves_analyzed": moves_analyzed,
        "unique_players": unique_players,
        "ai_win_rate": ai_win_rate,
        "training_moves": moves_analyzed,
        "days_running": (date.today() - LAUNCH_DATE).days,
    }


@router.get("/stats")
async def get_about_stats(db: AsyncSession = Depends(db_dependency)):
    """Return aggregated platform statistics, cached for 60 seconds."""
    now = time.time()
    if _cache["data"] is not None and now < _cache["expires"]:
        return _cache["data"]

    data = await _query_stats(db)
    _cache["data"] = data
    _cache["expires"] = now + _CACHE_TTL
    return data
