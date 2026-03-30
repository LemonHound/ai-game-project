"""Connect 4 game engine with heuristic AI strategy."""
import random
from typing import Optional

from game_engine.base import AIStrategy, GameEngine, GameState, Move

ROWS = 6
COLS = 7


def _drop_piece(board: list, col: int, player: str) -> Optional[int]:
    for row in range(ROWS - 1, -1, -1):
        if board[row][col] is None:
            board[row][col] = player
            return row
    return None


def _check_winner(board: list, row: int, col: int, player: str) -> bool:
    directions = [(0, 1), (1, 0), (1, 1), (1, -1)]
    for dr, dc in directions:
        count = 1
        for sign in (1, -1):
            r, c = row + sign * dr, col + sign * dc
            while 0 <= r < ROWS and 0 <= c < COLS and board[r][c] == player:
                count += 1
                r += sign * dr
                c += sign * dc
        if count >= 4:
            return True
    return False


def _find_winning_col(board: list, player: str) -> Optional[int]:
    for col in range(COLS):
        for row in range(ROWS - 1, -1, -1):
            if board[row][col] is None:
                board[row][col] = player
                if _check_winner(board, row, col, player):
                    board[row][col] = None
                    return col
                board[row][col] = None
                break
    return None


def _get_ai_move(board: list) -> int:
    valid = [c for c in range(COLS) if board[0][c] is None]
    win = _find_winning_col(board, "ai")
    if win is not None:
        return win
    block = _find_winning_col(board, "player")
    if block is not None:
        return block
    center = COLS // 2
    if center in valid:
        return center
    return random.choice(valid)


def _get_winning_cells(board: list, row: int, col: int, player: str) -> Optional[list]:
    directions = [(0, 1), (1, 0), (1, 1), (1, -1)]
    for dr, dc in directions:
        cells = [(row, col)]
        for sign in (1, -1):
            r, c = row + sign * dr, col + sign * dc
            while 0 <= r < ROWS and 0 <= c < COLS and board[r][c] == player:
                cells.append((r, c))
                r += sign * dr
                c += sign * dc
        if len(cells) >= 4:
            return cells[:4]
    return None


class Connect4Engine(GameEngine):
    """GameEngine implementation for Connect 4 on a 6×7 board."""

    def initial_state(self, player_starts: bool) -> GameState:
        """Return the starting state dict for a new Connect 4 game.

        Args:
            player_starts: If True, player moves first.

        Returns:
            GameState with board, current_turn, game_active, move_count,
            player_starts, last_move.
        """
        return {
            "board": [[None] * COLS for _ in range(ROWS)],
            "current_turn": "player" if player_starts else "ai",
            "game_active": True,
            "move_count": 0,
            "player_starts": player_starts,
            "last_move": None,
        }

    def validate_move(self, state: GameState, move: Move) -> bool:
        """Return True if the column drop is legal.

        Args:
            state: Current game state.
            move: Dict with key "col" (int 0–6).

        Returns:
            True if the game is active, move is a dict with a valid col, and the top
            cell of that column is empty.
        """
        if not state.get("game_active", False):
            return False
        if not isinstance(move, dict):
            return False
        col = move.get("col")
        if not isinstance(col, int) or not (0 <= col <= 6):
            return False
        return state["board"][0][col] is None

    def apply_move(self, state: GameState, move: Move) -> GameState:
        """Drop a piece into the specified column and return the updated state.

        Args:
            state: Current game state.
            move: Dict with key "col" indicating the column to drop into.

        Returns:
            New GameState with updated board, current_turn, move_count, and last_move.
        """
        col = move["col"]
        board = [row[:] for row in state["board"]]
        current_turn = state["current_turn"]

        row = _drop_piece(board, col, current_turn)
        next_turn = "ai" if current_turn == "player" else "player"

        return {
            **state,
            "board": board,
            "current_turn": next_turn,
            "move_count": state["move_count"] + 1,
            "last_move": {"row": row, "col": col, "player": current_turn},
        }

    def is_terminal(self, state: GameState) -> tuple[bool, Optional[str]]:
        """Check whether the game has ended after the last move.

        Args:
            state: Current game state.

        Returns:
            (True, "player_won"|"ai_won"|"draw") if terminal, (False, None) otherwise.
        """
        last_move = state.get("last_move")
        if not last_move:
            return False, None
        row = last_move["row"]
        col = last_move["col"]
        player = last_move["player"]
        board = state["board"]
        if _check_winner(board, row, col, player):
            outcome = "player_won" if player == "player" else "ai_won"
            return True, outcome
        if state["move_count"] >= ROWS * COLS:
            return True, "draw"
        return False, None

    def get_legal_moves(self, state: GameState) -> list[Move]:
        """Return all columns that are not yet full.

        Args:
            state: Current game state.

        Returns:
            List of dicts `{"col": int}` for each non-full column.
        """
        return [{"col": c} for c in range(COLS) if state["board"][0][c] is None]

    def get_winning_cells(self, state: GameState) -> Optional[list]:
        """Return the four winning cells as (row, col) tuples, or None if no winner.

        Args:
            state: Current game state after the winning move.

        Returns:
            List of four (row, col) tuples, or None if no four-in-a-row exists.
        """
        last_move = state.get("last_move")
        if not last_move:
            return None
        row = last_move["row"]
        col = last_move["col"]
        player = last_move["player"]
        return _get_winning_cells(state["board"], row, col, player)

    def outcome_to_persistence(self, state: GameState) -> Optional[str]:
        """Map game outcome to a persistence service outcome string.

        Args:
            state: Current game state.

        Returns:
            "player_won", "ai_won", "draw", or None if still in progress.
        """
        _, outcome = self.is_terminal(state)
        return outcome


class Connect4AIStrategy(AIStrategy):
    """Greedy AI for Connect 4: wins if possible, blocks if necessary, prefers center."""

    def generate_move(self, state: GameState) -> tuple[Move, None]:
        """Select a column to drop into using a greedy heuristic.

        Args:
            state: Current game state where it is the AI's turn.

        Returns:
            Tuple of ({"col": int}, None) — no eval score is returned.
        """
        board = [row[:] for row in state["board"]]
        col = _get_ai_move(board)
        return {"col": col}, None
