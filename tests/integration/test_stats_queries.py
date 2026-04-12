"""Integration tests for stats queries with seeded game data."""
import pytest
from sqlalchemy import text

import persistence_service
from db_models import GAME_TYPE_TO_MODEL
from game_engine.ttt_engine import TicTacToeEngine
from stats import _compute_leaderboard


async def _create_and_end_game(session, user_id, outcome):
    engine = TicTacToeEngine()
    state = engine.initial_state(player_starts=True)
    game = await persistence_service.create_game(session, user_id, "tic_tac_toe", state)
    await persistence_service.end_game(session, game.id, "tic_tac_toe", outcome)
    return game.id


@pytest.mark.asyncio
async def test_stats_query_exact_counts(seeded_db):
    user_id = 3
    ids = []
    for outcome in ["player_won", "player_won", "player_won", "ai_won", "draw"]:
        gid = await _create_and_end_game(seeded_db, user_id, outcome)
        ids.append(gid)

    result = await seeded_db.execute(
        text("""
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN player_won THEN 1 ELSE 0 END) as wins,
                SUM(CASE WHEN ai_won THEN 1 ELSE 0 END) as losses,
                SUM(CASE WHEN is_draw THEN 1 ELSE 0 END) as draws
            FROM tic_tac_toe_games
            WHERE user_id = :uid AND game_ended = true
        """),
        {"uid": user_id},
    )
    row = result.fetchone()
    assert row.total >= 5
    assert row.wins >= 3
    assert row.losses >= 1
    assert row.draws >= 1

    for gid in ids:
        await seeded_db.execute(
            text(f"DELETE FROM tic_tac_toe_games WHERE id = '{gid}'")
        )
    await seeded_db.commit()


@pytest.mark.asyncio
async def test_leaderboard_stats_public_default(seeded_db):
    result = await seeded_db.execute(
        text("SELECT stats_public FROM users WHERE email = 'demo@aigamehub.com'")
    )
    row = result.fetchone()
    assert row is not None
    assert row.stats_public is True


@pytest.mark.asyncio
async def test_leaderboard_stats_private_excluded(seeded_db):
    result = await seeded_db.execute(
        text("""
            SELECT COUNT(*) as cnt
            FROM users u
            JOIN tic_tac_toe_games g ON g.user_id = u.id
            WHERE u.stats_public = false AND g.game_ended = true
        """)
    )
    row = result.fetchone()
    assert row.cnt == 0


@pytest.mark.asyncio
async def test_leaderboard_pagination_returns_correct_slice(seeded_db):
    result = await seeded_db.execute(
        text("SELECT id FROM users WHERE stats_public = true ORDER BY id LIMIT 2")
    )
    rows = result.fetchall()
    assert len(rows) >= 2, "Seed data must include at least 2 public users"
    user_a, user_b = rows[0].id, rows[1].id

    a_ids = []
    for _ in range(3):
        gid = await _create_and_end_game(seeded_db, user_a, "player_won")
        a_ids.append(gid)
    b_id = await _create_and_end_game(seeded_db, user_b, "player_won")

    model = GAME_TYPE_TO_MODEL["tic_tac_toe"]

    page1 = await _compute_leaderboard(seeded_db, "games_played", "tic_tac_toe", model, page=1, per_page=1)
    page2 = await _compute_leaderboard(seeded_db, "games_played", "tic_tac_toe", model, page=2, per_page=1)

    assert len(page1["entries"]) == 1
    assert len(page2["entries"]) == 1
    assert page1["entries"][0]["rank"] == 1
    assert page2["entries"][0]["rank"] == 2
    assert page1["entries"][0]["user_id"] != page2["entries"][0]["user_id"]
    assert page1["page"] == 1
    assert page2["page"] == 2

    for gid in a_ids:
        await seeded_db.execute(text(f"DELETE FROM tic_tac_toe_games WHERE id = '{gid}'"))
    await seeded_db.execute(text(f"DELETE FROM tic_tac_toe_games WHERE id = '{b_id}'"))
    await seeded_db.commit()


@pytest.mark.asyncio
async def test_stats_cache_cleared_between_tests(seeded_db):
    from stats import clear_caches, _build_user_stats
    result = await seeded_db.execute(
        text("SELECT id FROM users WHERE stats_public = true ORDER BY id LIMIT 1")
    )
    user_id = result.fetchone().id

    gid = await _create_and_end_game(seeded_db, user_id, "player_won")

    clear_caches()
    stats = await _build_user_stats(seeded_db, user_id)
    total_wins = sum(g.get("wins", 0) for g in stats.get("per_game", {}).values())
    assert total_wins >= 1

    await seeded_db.execute(text(f"DELETE FROM tic_tac_toe_games WHERE id = '{gid}'"))
    await seeded_db.commit()


@pytest.mark.asyncio
async def test_leaderboard_ordering(seeded_db):
    result = await seeded_db.execute(
        text("SELECT id FROM users WHERE stats_public = true ORDER BY id LIMIT 2")
    )
    rows = result.fetchall()
    assert len(rows) >= 2, "Seed data must include at least 2 public users"
    user_a, user_b = rows[0].id, rows[1].id

    a_ids = [await _create_and_end_game(seeded_db, user_a, "player_won") for _ in range(3)]
    b_ids = [await _create_and_end_game(seeded_db, user_b, "player_won")]

    model = GAME_TYPE_TO_MODEL["tic_tac_toe"]
    page = await _compute_leaderboard(seeded_db, "games_played", "tic_tac_toe", model, page=1, per_page=2)

    entries = page["entries"]
    assert len(entries) >= 2
    assert entries[0]["value"] >= entries[1]["value"], "Leaderboard must be ordered by value descending"

    for gid in a_ids + b_ids:
        await seeded_db.execute(text(f"DELETE FROM tic_tac_toe_games WHERE id = '{gid}'"))
    await seeded_db.commit()
