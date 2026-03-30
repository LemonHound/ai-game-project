"""Pure game logic for Tic-Tac-Toe."""
import random
from typing import Any, Dict, List, Optional


class TicTacToe:
    """Tic-Tac-Toe game logic with difficulty-based AI (easy/medium/hard minimax)."""

    WINNING_LINES = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6],
    ]

    def get_initial_state(
        self, difficulty: str = "medium", player_starts: bool = True
    ) -> Dict[str, Any]:
        """Return the starting board state for a new Tic-Tac-Toe game.

        Args:
            difficulty: AI difficulty level — "easy", "medium", or "hard".
            player_starts: If True, player (X) moves first; otherwise AI (O) moves first.

        Returns:
            dict with keys: board (9-element list), current_player, player_symbol,
            ai_symbol, game_over, winner, difficulty, player_starts.
        """
        return {
            "board": [None] * 9,
            "current_player": "X" if player_starts else "O",
            "player_symbol": "X",
            "ai_symbol": "O",
            "game_over": False,
            "winner": None,
            "difficulty": difficulty,
            "player_starts": player_starts,
        }

    def apply_move(self, game_state: Dict[str, Any], position: int) -> Dict[str, Any]:
        """Apply a player move, then generate and apply the AI response.

        Args:
            game_state: Current game state dict from get_initial_state or a prior apply_move.
            position: Board index (0–8) for the player's move.

        Returns:
            dict with keys: player_move, board_after_player, game_over_after_player,
            ai_move, board_after_ai, game_over, winner.

        Raises:
            ValueError: If the game is already over, position is out of range, or
                the position is already taken.
        """
        board = game_state["board"][:]
        difficulty = game_state["difficulty"]

        if game_state["game_over"]:
            raise ValueError("Game is already over")
        if not (0 <= position <= 8):
            raise ValueError("Invalid position")
        if board[position] is not None:
            raise ValueError("Position already taken")

        board[position] = game_state["player_symbol"]
        player_board = {**game_state, "board": board}

        winner = self._check_winner(board)
        if winner or self._is_board_full(board):
            outcome = winner if winner else "tie"
            player_board = {**player_board, "game_over": True, "winner": outcome}
            return {
                "player_move": position,
                "board_after_player": player_board,
                "game_over_after_player": True,
                "ai_move": None,
                "board_after_ai": None,
                "game_over": True,
                "winner": outcome,
            }

        ai_position = self._get_ai_move(board, difficulty)
        board = board[:]
        board[ai_position] = game_state["ai_symbol"]

        winner = self._check_winner(board)
        game_over = bool(winner or self._is_board_full(board))
        outcome = winner if winner else ("tie" if game_over else None)
        ai_board = {
            **player_board,
            "board": board,
            "game_over": game_over,
            "winner": outcome,
        }

        return {
            "player_move": position,
            "board_after_player": player_board,
            "game_over_after_player": False,
            "ai_move": ai_position,
            "board_after_ai": ai_board,
            "game_over": game_over,
            "winner": outcome,
        }

    def _get_ai_move(self, board: List[Optional[str]], difficulty: str) -> int:
        available = [i for i, cell in enumerate(board) if cell is None]
        if not available:
            raise ValueError("No moves available")
        if difficulty == "easy":
            return random.choice(available)
        if difficulty == "medium":
            win = self._find_winning_move(board, "O")
            if win is not None:
                return win
            block = self._find_winning_move(board, "X")
            if block is not None:
                return block
            if 4 in available:
                return 4
            corners = [c for c in [0, 2, 6, 8] if c in available]
            if corners:
                return random.choice(corners)
            return random.choice(available)
        return self._get_best_move(board)

    def _find_winning_move(
        self, board: List[Optional[str]], player: str
    ) -> Optional[int]:
        for line in self.WINNING_LINES:
            vals = [board[i] for i in line]
            if vals.count(player) == 2 and vals.count(None) == 1:
                return next(line[i] for i in range(3) if board[line[i]] is None)
        return None

    def _get_best_move(self, board: List[Optional[str]]) -> int:
        best_score = -float("inf")
        best_move = 0
        for i in range(9):
            if board[i] is None:
                board[i] = "O"
                score = self._minimax(board, 0, False)
                board[i] = None
                if score > best_score:
                    best_score = score
                    best_move = i
        return best_move

    def _minimax(
        self, board: List[Optional[str]], depth: int, is_maximizing: bool
    ) -> int:
        winner = self._check_winner(board)
        if winner == "O":
            return 1
        if winner == "X":
            return -1
        if self._is_board_full(board):
            return 0
        if is_maximizing:
            best = -float("inf")
            for i in range(9):
                if board[i] is None:
                    board[i] = "O"
                    best = max(best, self._minimax(board, depth + 1, False))
                    board[i] = None
            return best
        best = float("inf")
        for i in range(9):
            if board[i] is None:
                board[i] = "X"
                best = min(best, self._minimax(board, depth + 1, True))
                board[i] = None
        return best

    def _check_winner(self, board: List[Optional[str]]) -> Optional[str]:
        for line in self.WINNING_LINES:
            if board[line[0]] and board[line[0]] == board[line[1]] == board[line[2]]:
                return board[line[0]]
        return None

    def _is_board_full(self, board: List[Optional[str]]) -> bool:
        return None not in board


tic_tac_toe_game = TicTacToe()
