from fastapi import APIRouter, HTTPException
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid

from models import GameInfo, StartGameRequest, MoveRequest, CompleteGameRequest, TrainAIRequest
from database import get_db_connection, return_db_connection
from tic_tac_toe import tic_tac_toe_game

router = APIRouter()

# ============================================
# GAME METADATA ENDPOINTS
# ============================================

@router.get("/games")
async def get_games(category: Optional[str] = None, status: Optional[str] = None):
    """Get list of all available games from database"""
    conn = None
    try:
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=500, detail="Database connection not available")

        cursor = conn.cursor()
        query = "SELECT id, name, description, icon, difficulty, players, status, category, tags FROM games WHERE 1=1"
        params = []

        if category:
            query += " AND category = %s"
            params.append(category)

        if status:
            query += " AND status = %s"
            params.append(status)

        cursor.execute(query, params if params else None)
        rows = cursor.fetchall()
        cursor.close()

        games = [{
            'id': row[0],
            'name': row[1],
            'description': row[2],
            'icon': row[3],
            'difficulty': row[4],
            'players': row[5],
            'status': row[6],
            'category': row[7],
            'tags': row[8]
        } for row in rows]

        return {"games": games}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            return_db_connection(conn)

@router.get("/game/{game_id}/info")
async def get_game_info(game_id: str):
    """Get detailed information about a specific game"""
    conn = None
    try:
        conn = get_db_connection()
        if not conn:
            raise HTTPException(status_code=500, detail="Database connection not available")

        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, name, description, icon, difficulty, players, status, category, tags FROM games WHERE id = %s",
            (game_id,)
        )
        row = cursor.fetchone()
        cursor.close()

        if not row:
            raise HTTPException(status_code=404, detail=f"Game '{game_id}' not found")

        game = {
            'id': row[0],
            'name': row[1],
            'description': row[2],
            'icon': row[3],
            'difficulty': row[4],
            'players': row[5],
            'status': row[6],
            'category': row[7],
            'tags': row[8]
        }

        return {"game": game}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            return_db_connection(conn)

@router.get("/game/{game_id}/stats")
async def get_game_stats(game_id: str, user_id: Optional[int] = None):
    """Get user statistics for a specific game"""
    conn = None
    try:
        conn = get_db_connection()
        if not conn:
            return {
                "gamesPlayed": 0,
                "winRate": 0.0,
                "bestStreak": 0,
                "aiLevel": 3
            }

        # TODO: Implement actual stats calculation from game tables
        return {
            "gamesPlayed": 0,
            "winRate": 0.0,
            "bestStreak": 0,
            "aiLevel": 3
        }
    finally:
        if conn:
            return_db_connection(conn)

# ============================================
# GAMEPLAY ENDPOINTS
# ============================================

@router.post("/game/{game_id}/start")
async def start_game(game_id: str, request: StartGameRequest):
    """Start a new game session"""
    try:
        if game_id == "tic-tac-toe":
            result = tic_tac_toe_game.start_game(
                user_id=request.userId,
                difficulty=request.difficulty,
                player_starts=request.playerStarts
            )
            return result

        # TODO: Add other game types
        # elif game_id == "checkers":
        #     return checkers_game.start_game(...)

        raise HTTPException(status_code=501, detail=f"Game '{game_id}' not implemented yet")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/game/{game_id}/move")
async def make_move(game_id: str, request: MoveRequest):
    """Make a move in an active game"""
    try:
        if game_id == "tic-tac-toe":
            result = tic_tac_toe_game.make_move(
                session_id=request.gameSessionId,
                position=request.move,
                user_id=request.userId
            )
            return result

        # TODO: Add other game types
        # elif game_id == "checkers":
        #     return checkers_game.make_move(...)

        raise HTTPException(status_code=501, detail=f"Game '{game_id}' not implemented yet")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/game/{game_id}/complete")
async def complete_game(game_id: str, request: CompleteGameRequest):
    """Complete a game and save results"""
    # Game completion is handled automatically in game logic
    return {
        "success": True,
        "message": "Game completed successfully"
    }

@router.get("/game/{game_id}/session/{session_id}")
async def get_game_session(game_id: str, session_id: str):
    """Get current state of a game session"""
    try:
        if game_id == "tic-tac-toe":
            if session_id not in tic_tac_toe_game.sessions:
                raise HTTPException(status_code=404, detail="Session not found")

            game_state = tic_tac_toe_game.sessions[session_id]
            return tic_tac_toe_game._get_client_state(game_state)

        # TODO: Add other game types

        raise HTTPException(status_code=501, detail=f"Game '{game_id}' not implemented yet")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
