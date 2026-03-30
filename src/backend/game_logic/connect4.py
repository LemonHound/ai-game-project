"""Pure game logic for Connect 4."""
import random
from typing import Any, Dict, List, Optional, Tuple


class Connect4Game:
    """Connect 4 game logic for a 6×7 board with column-drop gravity."""

    ROWS = 6
    COLS = 7

    def get_initial_state(
        self, difficulty: str = "medium", player_starts: bool = True
    ) -> Dict[str, Any]:
        """Return the starting board state for a new Connect 4 game.

        Args:
            difficulty: AI difficulty level — "easy" or "medium".
            player_starts: If True, player moves first; otherwise AI moves first.

        Returns:
            dict with keys: board (6×7 nested list), current_player, game_active,
            move_count, difficulty.
        """
        return {
            "board": [[None] * self.COLS for _ in range(self.ROWS)],
            "current_player": "player" if player_starts else "ai",
            "game_active": True,
            "move_count": 0,
            "difficulty": difficulty,
        }

    def apply_move(
        self, game_state: Dict[str, Any], move: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Apply a player column drop, then generate and apply the AI response.

        Args:
            game_state: Current game state dict from get_initial_state or a prior apply_move.
            move: dict with key "col" (int, 0–6) indicating the column to drop into.

        Returns:
            dict with keys: player_move, board_after_player, game_over_after_player,
            ai_move, board_after_ai, game_over, winner.

        Raises:
            ValueError: If the game is not active, it is not the player's turn,
                or the chosen column is full.
        """
        col = move.get("col") if isinstance(move, dict) else move
        board = [row[:] for row in game_state["board"]]
        difficulty = game_state["difficulty"]

        if not game_state["game_active"]:
            raise ValueError("Game is not active")
        if game_state["current_player"] != "player":
            raise ValueError("Not player's turn")

        row = self._drop_piece(board, col, "player")
        if row is None:
            raise ValueError("Column is full")

        move_count = game_state["move_count"] + 1
        player_move = {"row": row, "col": col}
        player_board = {
            **game_state,
            "board": board,
            "move_count": move_count,
        }

        if self._check_winner(board, row, col, "player"):
            player_board = {**player_board, "game_active": False}
            return {
                "player_move": player_move,
                "board_after_player": player_board,
                "game_over_after_player": True,
                "ai_move": None,
                "board_after_ai": None,
                "game_over": True,
                "winner": "player",
            }

        if move_count >= self.ROWS * self.COLS:
            player_board = {**player_board, "game_active": False}
            return {
                "player_move": player_move,
                "board_after_player": player_board,
                "game_over_after_player": True,
                "ai_move": None,
                "board_after_ai": None,
                "game_over": True,
                "winner": "draw",
            }

        ai_col = self._get_ai_move(board, difficulty)
        ai_row = self._drop_piece(board, ai_col, "ai")
        move_count += 1
        ai_move = {"row": ai_row, "col": ai_col}

        game_over = self._check_winner(board, ai_row, ai_col, "ai")
        if not game_over and move_count >= self.ROWS * self.COLS:
            game_over = True
            winner = "draw"
        else:
            winner = "ai" if game_over else None

        ai_board = {
            **player_board,
            "board": board,
            "move_count": move_count,
            "game_active": not (game_over or winner == "draw"),
        }

        return {
            "player_move": player_move,
            "board_after_player": player_board,
            "game_over_after_player": False,
            "ai_move": ai_move,
            "board_after_ai": ai_board,
            "game_over": bool(game_over or winner == "draw"),
            "winner": winner,
        }

    def apply_ai_first_move(
        self, game_state: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate and apply the AI's opening move when AI starts the game.

        Args:
            game_state: Initial game state with move_count == 0.

        Returns:
            dict with keys: ai_move, board_after_ai, game_over, winner.

        Raises:
            ValueError: If move_count > 0 (game has already started).
        """
        board = [row[:] for row in game_state["board"]]
        difficulty = game_state["difficulty"]

        if game_state["move_count"] > 0:
            raise ValueError("AI first move only valid at game start")

        ai_col = self._get_ai_move(board, difficulty)
        ai_row = self._drop_piece(board, ai_col, "ai")
        ai_move = {"row": ai_row, "col": ai_col}

        new_state = {
            **game_state,
            "board": board,
            "move_count": 1,
            "current_player": "player",
        }

        return {
            "ai_move": ai_move,
            "board_after_ai": new_state,
            "game_over": False,
            "winner": None,
        }

    def _drop_piece(
        self, board: List[List[Optional[str]]], col: int, player: str
    ) -> Optional[int]:
        if not (0 <= col < self.COLS):
            return None
        for row in range(self.ROWS - 1, -1, -1):
            if board[row][col] is None:
                board[row][col] = player
                return row
        return None

    def _check_winner(
        self,
        board: List[List[Optional[str]]],
        row: int,
        col: int,
        player: str,
    ) -> bool:
        directions = [(0, 1), (1, 0), (1, 1), (1, -1)]
        for dr, dc in directions:
            count = 1
            for sign in (1, -1):
                r, c = row + sign * dr, col + sign * dc
                while (
                    0 <= r < self.ROWS
                    and 0 <= c < self.COLS
                    and board[r][c] == player
                ):
                    count += 1
                    r += sign * dr
                    c += sign * dc
            if count >= 4:
                return True
        return False

    def _get_ai_move(
        self, board: List[List[Optional[str]]], difficulty: str
    ) -> int:
        valid = [c for c in range(self.COLS) if board[0][c] is None]
        if not valid:
            raise ValueError("No valid moves")
        if difficulty == "easy":
            return random.choice(valid)
        win = self._find_winning_col(board, "ai")
        if win is not None:
            return win
        block = self._find_winning_col(board, "player")
        if block is not None:
            return block
        center = self.COLS // 2
        if center in valid:
            return center
        return random.choice(valid)

    def _find_winning_col(
        self, board: List[List[Optional[str]]], player: str
    ) -> Optional[int]:
        for col in range(self.COLS):
            for row in range(self.ROWS - 1, -1, -1):
                if board[row][col] is None:
                    board[row][col] = player
                    if self._check_winner(board, row, col, player):
                        board[row][col] = None
                        return col
                    board[row][col] = None
                    break
        return None


connect4_game = Connect4Game()
