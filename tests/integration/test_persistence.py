"""Integration tests for persistence_service: create, read, update game records."""
import json
import os
from pathlib import Path

import pytest
from sqlalchemy import text

import persistence_service
from db_models import TicTacToeGame, ChessGame, Connect4Game, GAME_TYPE_TO_MODEL
from game_engine.ttt_engine import TicTacToeEngine


def _load_fixture(name):
    path = Path(__file__).resolve().parents[1] / "fixtures" / name
    return json.loads(path.read_text())


@pytest.mark.asyncio
async def test_create_game_persists_initial_state(seeded_db):
    engine = TicTacToeEngine()
    state = engine.initial_state(player_starts=True)
    game = await persistence_service.create_game(seeded_db, 1, "tic_tac_toe", state)
    assert game is not None
    assert game.board_state == state
    assert game.game_ended is False
    assert game.move_list == []
    await seeded_db.execute(
        text(f"DELETE FROM tic_tac_toe_games WHERE id = '{game.id}'")
    )
    await seeded_db.commit()


@pytest.mark.asyncio
async def test_record_move_updates_board_state(seeded_db):
    engine = TicTacToeEngine()
    state = engine.initial_state(player_starts=True)
    game = await persistence_service.create_game(seeded_db, 1, "tic_tac_toe", state)
    new_state = engine.apply_move(state, 4)
    await persistence_service.record_move(seeded_db, game.id, "tic_tac_toe", "r1c1", new_state)
    updated = await persistence_service.get_game(seeded_db, game.id, "tic_tac_toe")
    assert updated.board_state["board"][4] == "X"
    assert "r1c1" in updated.move_list
    await seeded_db.execute(
        text(f"DELETE FROM tic_tac_toe_games WHERE id = '{game.id}'")
    )
    await seeded_db.commit()


@pytest.mark.asyncio
async def test_game_roundtrip_ttt(seeded_db):
    fixture = _load_fixture("ttt_states.json")["x_wins_diagonal"]
    game = await persistence_service.create_game(
        seeded_db, 1, "tic_tac_toe", fixture["board"]
    )
    retrieved = await persistence_service.get_game(seeded_db, game.id, "tic_tac_toe")
    assert retrieved.board_state == fixture["board"]
    assert retrieved.board_state["board"][0] == "X"
    assert retrieved.board_state["board"][4] == "X"
    assert retrieved.board_state["board"][8] == "X"
    await seeded_db.execute(
        text(f"DELETE FROM tic_tac_toe_games WHERE id = '{game.id}'")
    )
    await seeded_db.commit()


@pytest.mark.asyncio
async def test_game_roundtrip_connect4(seeded_db):
    fixture = _load_fixture("connect4_states.json")["vertical_win"]
    game = await persistence_service.create_game(
        seeded_db, 1, "connect4", fixture["board"]
    )
    retrieved = await persistence_service.get_game(seeded_db, game.id, "connect4")
    assert retrieved.board_state == fixture["board"]
    assert retrieved.board_state["board"][5][3] == "player"
    assert retrieved.board_state["board"][4][3] == "player"
    await seeded_db.execute(
        text(f"DELETE FROM connect4_games WHERE id = '{game.id}'")
    )
    await seeded_db.commit()
