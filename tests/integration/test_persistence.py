"""Integration tests for persistence_service: create, read, update game records."""
import json
import os
from pathlib import Path

import pytest
from sqlalchemy import text

import persistence_service
from db_models import TicTacToeGame, ChessGame, Connect4Game, GAME_TYPE_TO_MODEL
from game_engine.checkers_engine import CheckersEngine
from game_engine.chess_engine import ChessEngine
from game_engine.dab_engine import DaBEngine
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


@pytest.mark.asyncio
async def test_game_roundtrip_chess(seeded_db):
    state = ChessEngine().initial_state(player_starts=True)
    game = await persistence_service.create_game(seeded_db, 1, "chess", state)
    retrieved = await persistence_service.get_game(seeded_db, game.id, "chess")
    assert retrieved.board_state == state
    board = retrieved.board_state["board"]
    piece_count = sum(1 for row in board for cell in row if cell is not None)
    assert piece_count == 32
    await seeded_db.execute(text(f"DELETE FROM chess_games WHERE id = '{game.id}'"))
    await seeded_db.commit()


@pytest.mark.asyncio
async def test_game_roundtrip_checkers(seeded_db):
    state = CheckersEngine().initial_state(player_starts=True)
    game = await persistence_service.create_game(seeded_db, 1, "checkers", state)
    retrieved = await persistence_service.get_game(seeded_db, game.id, "checkers")
    assert retrieved.board_state == state
    pieces = [p for p in retrieved.board_state["board"] if p not in ("_", None)]
    assert len(pieces) == 24
    await seeded_db.execute(text(f"DELETE FROM checkers_games WHERE id = '{game.id}'"))
    await seeded_db.commit()


@pytest.mark.asyncio
async def test_game_roundtrip_dab(seeded_db):
    state = DaBEngine().initial_state(player_starts=True)
    game = await persistence_service.create_game(seeded_db, 1, "dots_and_boxes", state)
    retrieved = await persistence_service.get_game(seeded_db, game.id, "dots_and_boxes")
    assert retrieved.board_state == state
    assert retrieved.board_state["grid_size"] == state["grid_size"]
    assert retrieved.board_state["horizontal_lines"] == state["horizontal_lines"]
    assert retrieved.board_state["vertical_lines"] == state["vertical_lines"]
    await seeded_db.execute(text(f"DELETE FROM dots_and_boxes_games WHERE id = '{game.id}'"))
    await seeded_db.commit()
