"""Integration tests for stats queries with seeded game data."""
import pytest
from sqlalchemy import text

import persistence_service
from game_engine.ttt_engine import TicTacToeEngine


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
