from fastapi import APIRouter, HTTPException
from typing import Optional

from models import StartGameRequest, MoveRequest, CompleteGameRequest
from database import get_db_connection, return_db_connection
from game_logic.tic_tac_toe import tic_tac_toe_game
from game_logic.dots_and_boxes import dots_and_boxes_game
from game_logic.chess import chess_game
from game_logic.connect4 import connect4_game
from game_logic.checkers import checkers_game

router = APIRouter()

# ============================================
# GAME METADATA ENDPOINTS
# ============================================

@router.get("/games_list")
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

        elif game_id == "dots-and-boxes":
            result = dots_and_boxes_game.start_game(
                user_id=request.userId,
                difficulty=request.difficulty,
                player_starts=request.playerStarts
            )
            return result

        elif game_id == "chess":
            result = chess_game.start_game(
                user_id=request.userId,
                difficulty=request.difficulty,
                playerStarts=request.playerStarts
            )
            return result

        elif game_id == "connect4":
            result = connect4_game.start_game(
                user_id=request.userId,
                difficulty=request.difficulty,
                playerStarts=request.playerStarts
            )
            return result

        elif game_id == "checkers":
            result = checkers_game.start_game(
                user_id=request.userId,
                difficulty=request.difficulty,
                player_starts=request.playerStarts
            )
            return result

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

        elif game_id == "dots-and-boxes":
            result = dots_and_boxes_game.make_move(
                session_id=request.gameSessionId,
                move=request.move,
                user_id=request.userId
            )
            return result

        elif game_id == "chess":
            result = chess_game.make_move(
                session_id=request.gameSessionId,
                move=request.move,
                user_id=request.userId
            )
            return result

        elif game_id == "connect4":
            result = connect4_game.make_move(
                session_id=request.gameSessionId,
                move=request.move,
                user_id=request.userId
            )
            return result

        elif game_id == "checkers":
            result = checkers_game.make_move(
                session_id=request.gameSessionId,
                move=request.move,
                user_id=request.userId
            )
            return result

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

@router.post("/game/{game_id}/ai-first")
async def ai_first_move(game_id: str, request: MoveRequest):
    """Let AI make the first move"""
    try:
        if game_id == "connect4":
            result = connect4_game.ai_first_move(
                session_id=request.gameSessionId,
                user_id=request.userId
            )
            return result

        raise HTTPException(status_code=501, detail=f"AI first move not supported for '{game_id}'")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/game/{game_id}/session/{session_id}")
async def get_game_session(game_id: str, session_id: str):
    """Get current state of a game session"""
    try:
        if game_id == "tic-tac-toe":
            if session_id not in tic_tac_toe_game.sessions:
                raise HTTPException(status_code=404, detail="Session not found")

            game_state = tic_tac_toe_game.sessions[session_id]
            return tic_tac_toe_game._get_client_state(game_state)

        elif game_id == "chess":
            if session_id not in chess_game.sessions:
                raise HTTPException(status_code=404, detail="Session not found")

            game_state = chess_game.sessions[session_id]
            return {
                'boardState': game_state['board'],
                'currentPlayer': game_state['currentPlayer'],
                'playerColor': game_state['playerColor'],
                'gameActive': game_state['gameActive']
            }

        elif game_id == "connect4":
            if session_id not in connect4_game.sessions:
                raise HTTPException(status_code=404, detail="Session not found")

            game_state = connect4_game.sessions[session_id]
            return {
                'boardState': game_state['board'],
                'currentPlayer': game_state['currentPlayer'],
                'gameActive': game_state['gameActive']
            }

        raise HTTPException(status_code=501, detail=f"Game '{game_id}' not implemented yet")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))