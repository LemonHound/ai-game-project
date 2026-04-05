"""Stats and leaderboard endpoints."""
import logging
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, case, extract, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from auth_deps import optional_user, require_user
from db import db_dependency, get_session
from db_models import GAME_TYPE_TO_MODEL

logger = logging.getLogger(__name__)

router = APIRouter()

_CACHE_TTL = 60
_stats_cache: dict[int, dict] = {}
_leaderboard_cache: dict[tuple, dict] = {}

EMPTY_GAME_STATS = {
    "games_played": 0,
    "wins": 0,
    "losses": 0,
    "draws": 0,
    "games_abandoned": 0,
    "win_rate": 0.0,
    "best_streak": 0,
    "current_streak": 0,
    "avg_duration_seconds": 0.0,
}

ALL_GAME_TYPES = list(GAME_TYPE_TO_MODEL.keys()) + ["pong"]


def _empty_response() -> dict:
    return {"per_game": {gt: dict(EMPTY_GAME_STATS) for gt in ALL_GAME_TYPES}}


def _is_old_abandoned(game_abandoned, last_move_at):
    threshold = func.now() - text("INTERVAL '4 hours'")
    return and_(game_abandoned.is_(True), last_move_at < threshold)


async def _compute_game_stats(
    db: AsyncSession, user_id: int, game_type: str, model
) -> dict:
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)

    completed = and_(
        model.game_ended.is_(True),
        model.user_id == user_id,
    )
    old_abandoned = _is_old_abandoned(model.game_abandoned, model.last_move_at)
    counts_for_stats = and_(completed, ~old_abandoned)

    row = (
        await db.execute(
            select(
                func.count().filter(counts_for_stats).label("games_played"),
                func.count()
                .filter(counts_for_stats, model.player_won.is_(True))
                .label("wins"),
                func.count()
                .filter(
                    counts_for_stats,
                    model.ai_won.is_(True),
                )
                .label("losses_from_ai"),
                func.count()
                .filter(
                    counts_for_stats,
                    model.game_abandoned.is_(True),
                )
                .label("losses_from_abandon"),
                func.count()
                .filter(counts_for_stats, model.is_draw.is_(True))
                .label("draws"),
                func.count()
                .filter(completed, old_abandoned)
                .label("games_abandoned"),
                func.coalesce(
                    func.avg(
                        case(
                            (
                                counts_for_stats,
                                extract(
                                    "epoch",
                                    model.last_move_at - model.created_at,
                                ),
                            ),
                        )
                    ),
                    0.0,
                ).label("avg_duration"),
            ).select_from(model)
        )
    ).one()

    games_played = row.games_played
    wins = row.wins
    losses = row.losses_from_ai + row.losses_from_abandon
    draws = row.draws
    games_abandoned = row.games_abandoned
    decided = wins + losses
    win_rate = round(wins / decided, 3) if decided > 0 else 0.0

    best_streak, current_streak = await _compute_streaks(
        db, user_id, model
    )

    return {
        "games_played": games_played,
        "wins": wins,
        "losses": losses,
        "draws": draws,
        "games_abandoned": games_abandoned,
        "win_rate": win_rate,
        "best_streak": best_streak,
        "current_streak": current_streak,
        "avg_duration_seconds": round(float(row.avg_duration), 1),
    }


async def _compute_streaks(
    db: AsyncSession, user_id: int, model
) -> tuple[int, int]:
    old_abandoned = _is_old_abandoned(model.game_abandoned, model.last_move_at)

    rows = (
        await db.execute(
            select(model.player_won, model.ai_won, model.is_draw)
            .where(
                model.user_id == user_id,
                model.game_ended.is_(True),
                ~old_abandoned,
            )
            .order_by(model.last_move_at.asc())
        )
    ).all()

    best_streak = 0
    current_streak = 0
    for row in rows:
        if row.player_won:
            current_streak += 1
            best_streak = max(best_streak, current_streak)
        else:
            current_streak = 0

    return best_streak, current_streak


async def _build_user_stats(db: AsyncSession, user_id: int) -> dict:
    per_game = {}
    for game_type in ALL_GAME_TYPES:
        model = GAME_TYPE_TO_MODEL.get(game_type)
        if model is None:
            per_game[game_type] = dict(EMPTY_GAME_STATS)
            continue
        per_game[game_type] = await _compute_game_stats(
            db, user_id, game_type, model
        )
    return {"per_game": per_game}


def _get_cached_stats(user_id: int) -> Optional[dict]:
    entry = _stats_cache.get(user_id)
    if entry and time.time() < entry["expires"]:
        return entry["data"]
    return None


def _set_cached_stats(user_id: int, data: dict) -> None:
    _stats_cache[user_id] = {"data": data, "expires": time.time() + _CACHE_TTL}


@router.get("/stats/me")
async def get_my_stats(
    db: AsyncSession = Depends(db_dependency),
    user: Optional[dict] = Depends(optional_user),
):
    if not user:
        return _empty_response()

    cached = _get_cached_stats(user["id"])
    if cached:
        return cached

    data = await _build_user_stats(db, user["id"])
    _set_cached_stats(user["id"], data)
    return data


@router.get("/stats/user/{user_id}")
async def get_user_stats(
    user_id: int,
    db: AsyncSession = Depends(db_dependency),
    user: dict = Depends(require_user),
):
    async with get_session() as session:
        row = (
            await session.execute(
                text("SELECT stats_public FROM users WHERE id = :id"),
                {"id": user_id},
            )
        ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    if not row.stats_public and user["id"] != user_id:
        raise HTTPException(status_code=403, detail="This user's stats are private")

    cached = _get_cached_stats(user_id)
    if cached:
        return cached

    data = await _build_user_stats(db, user_id)
    _set_cached_stats(user_id, data)
    return data


VALID_BOARD_TYPES = {"games_played", "streak_high_score", "current_streak"}


@router.get("/leaderboard/{board_type}")
async def get_leaderboard(
    board_type: str,
    game_type: str = Query(..., description="Game type key"),
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(db_dependency),
):
    if board_type not in VALID_BOARD_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid board_type. Must be one of: {', '.join(sorted(VALID_BOARD_TYPES))}",
        )

    model = GAME_TYPE_TO_MODEL.get(game_type)
    if model is None:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid game_type. Must be one of: {', '.join(sorted(GAME_TYPE_TO_MODEL.keys()))}",
        )

    cache_key = (board_type, game_type, page, per_page)
    cached = _leaderboard_cache.get(cache_key)
    if cached and time.time() < cached["expires"]:
        return cached["data"]

    data = await _compute_leaderboard(db, board_type, game_type, model, page, per_page)

    _leaderboard_cache[cache_key] = {"data": data, "expires": time.time() + _CACHE_TTL}
    return data


async def _compute_leaderboard(
    db: AsyncSession,
    board_type: str,
    game_type: str,
    model,
    page: int,
    per_page: int,
) -> dict:
    old_abandoned = _is_old_abandoned(model.game_abandoned, model.last_move_at)
    counts_for_stats = and_(
        model.game_ended.is_(True),
        ~old_abandoned,
    )

    if board_type == "games_played":
        return await _leaderboard_games_played(
            db, game_type, model, counts_for_stats, page, per_page
        )

    return await _leaderboard_streak(
        db, board_type, game_type, model, page, per_page
    )


async def _leaderboard_games_played(
    db: AsyncSession,
    game_type: str,
    model,
    counts_for_stats,
    page: int,
    per_page: int,
) -> dict:
    subq = (
        select(
            model.user_id,
            func.count().filter(counts_for_stats).label("value"),
        )
        .group_by(model.user_id)
        .subquery()
    )

    total_q = await db.execute(
        select(func.count()).select_from(subq).where(
            subq.c.user_id.in_(
                select(text("id")).select_from(text("users")).where(
                    text("stats_public = true")
                )
            ),
            subq.c.value > 0,
        )
    )
    total_entries = total_q.scalar_one()

    offset = (page - 1) * per_page
    rows = (
        await db.execute(
            select(
                subq.c.user_id,
                subq.c.value,
                text("users.display_name"),
            )
            .select_from(subq)
            .join(text("users"), subq.c.user_id == text("users.id"))
            .where(text("users.stats_public = true"), subq.c.value > 0)
            .order_by(subq.c.value.desc(), subq.c.user_id.asc())
            .offset(offset)
            .limit(per_page)
        )
    ).all()

    entries = [
        {
            "rank": offset + i + 1,
            "user_id": row.user_id,
            "display_name": row.display_name,
            "value": row.value,
        }
        for i, row in enumerate(rows)
    ]

    return {
        "board_type": "games_played",
        "game_type": game_type,
        "entries": entries,
        "page": page,
        "per_page": per_page,
        "total_entries": total_entries,
    }


async def _leaderboard_streak(
    db: AsyncSession,
    board_type: str,
    game_type: str,
    model,
    page: int,
    per_page: int,
) -> dict:
    old_abandoned = _is_old_abandoned(model.game_abandoned, model.last_move_at)

    user_ids_result = await db.execute(
        select(text("id")).select_from(text("users")).where(
            text("stats_public = true")
        )
    )
    public_user_ids = [r[0] for r in user_ids_result.all()]

    if not public_user_ids:
        return {
            "board_type": board_type,
            "game_type": game_type,
            "entries": [],
            "page": page,
            "per_page": per_page,
            "total_entries": 0,
        }

    user_streaks = []
    for uid in public_user_ids:
        best, current = await _compute_streaks(db, uid, model)
        value = best if board_type == "streak_high_score" else current
        if value > 0:
            user_streaks.append((uid, value))

    user_streaks.sort(key=lambda x: (-x[1], x[0]))
    total_entries = len(user_streaks)

    offset = (page - 1) * per_page
    page_slice = user_streaks[offset : offset + per_page]

    display_names = {}
    if page_slice:
        slice_ids = [s[0] for s in page_slice]
        placeholders = ", ".join(f":id_{i}" for i in range(len(slice_ids)))
        params = {f"id_{i}": uid for i, uid in enumerate(slice_ids)}
        name_rows = (
            await db.execute(
                text(f"SELECT id, display_name FROM users WHERE id IN ({placeholders})"),
                params,
            )
        ).all()
        display_names = {r.id: r.display_name for r in name_rows}

    entries = [
        {
            "rank": offset + i + 1,
            "user_id": uid,
            "display_name": display_names.get(uid, "Unknown"),
            "value": value,
        }
        for i, (uid, value) in enumerate(page_slice)
    ]

    return {
        "board_type": board_type,
        "game_type": game_type,
        "entries": entries,
        "page": page,
        "per_page": per_page,
        "total_entries": total_entries,
    }
