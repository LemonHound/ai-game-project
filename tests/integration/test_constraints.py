"""Integration tests for database constraints."""
import pytest
from sqlalchemy import text

import persistence_service
from game_engine.ttt_engine import TicTacToeEngine


@pytest.mark.asyncio
async def test_one_active_game_constraint(seeded_db):
    await seeded_db.execute(
        text("DELETE FROM tic_tac_toe_games WHERE user_id = 2 AND NOT game_ended")
    )
    await seeded_db.commit()
    engine = TicTacToeEngine()
    state = engine.initial_state(player_starts=True)
    game1 = await persistence_service.create_game(seeded_db, 2, "tic_tac_toe", state)
    game1_id = str(game1.id)
    with pytest.raises(Exception):
        await persistence_service.create_game(seeded_db, 2, "tic_tac_toe", state)
    await seeded_db.rollback()
    await seeded_db.execute(
        text("DELETE FROM tic_tac_toe_games WHERE id = :gid"),
        {"gid": game1_id},
    )
    await seeded_db.commit()


@pytest.mark.asyncio
async def test_unique_email_constraint(seeded_db):
    with pytest.raises(Exception):
        await seeded_db.execute(
            text("""
                INSERT INTO users (username, email, password_hash, display_name, auth_provider, email_verified)
                VALUES ('dupe', 'test@example.com', 'hash', 'Dupe', 'local', true)
            """)
        )
        await seeded_db.commit()
    await seeded_db.rollback()
