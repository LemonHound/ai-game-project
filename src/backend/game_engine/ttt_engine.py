from typing import Optional

from game_engine.base import AIStrategy, GameEngine, GameState, Move

WINNING_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
]


def _check_winner(board: list) -> Optional[str]:
    for line in WINNING_LINES:
        if board[line[0]] and board[line[0]] == board[line[1]] == board[line[2]]:
            return board[line[0]]
    return None


def _minimax(
    board: list, is_maximizing: bool, ai_symbol: str, player_symbol: str
) -> int:
    winner = _check_winner(board)
    if winner == ai_symbol:
        return 1
    if winner == player_symbol:
        return -1
    if None not in board:
        return 0
    if is_maximizing:
        best = -2
        for i in range(9):
            if board[i] is None:
                board[i] = ai_symbol
                best = max(best, _minimax(board, False, ai_symbol, player_symbol))
                board[i] = None
        return best
    best = 2
    for i in range(9):
        if board[i] is None:
            board[i] = player_symbol
            best = min(best, _minimax(board, True, ai_symbol, player_symbol))
            board[i] = None
    return best


class TicTacToeEngine(GameEngine):
    def initial_state(self, player_starts: bool) -> GameState:
        return {
            "board": [None] * 9,
            "current_turn": "player" if player_starts else "ai",
            "player_symbol": "X" if player_starts else "O",
            "ai_symbol": "O" if player_starts else "X",
            "player_starts": player_starts,
            "status": "in_progress",
            "winner": None,
            "winning_positions": None,
        }

    def validate_move(self, state: GameState, move: Move) -> bool:
        if state.get("status") != "in_progress":
            return False
        if not isinstance(move, int):
            return False
        if not (0 <= move <= 8):
            return False
        return state["board"][move] is None

    def apply_move(self, state: GameState, move: Move) -> GameState:
        """Apply a move for whichever player's turn it currently is."""
        board = state["board"][:]
        turn = state["current_turn"]
        symbol = state["player_symbol"] if turn == "player" else state["ai_symbol"]
        next_turn = "ai" if turn == "player" else "player"

        board[move] = symbol
        terminal, outcome, winning_positions = self._check_terminal(board)
        return {
            **state,
            "board": board,
            "current_turn": next_turn if not terminal else turn,
            "status": "complete" if terminal else "in_progress",
            "winner": outcome,
            "winning_positions": winning_positions,
        }

    def is_terminal(self, state: GameState) -> tuple[bool, Optional[str]]:
        terminal, outcome, _ = self._check_terminal(state["board"])
        return terminal, outcome

    def get_legal_moves(self, state: GameState) -> list[Move]:
        return [i for i, cell in enumerate(state["board"]) if cell is None]

    def _check_terminal(
        self, board: list
    ) -> tuple[bool, Optional[str], Optional[list[int]]]:
        for line in WINNING_LINES:
            if board[line[0]] and board[line[0]] == board[line[1]] == board[line[2]]:
                return True, board[line[0]], line
        if None not in board:
            return True, "draw", None
        return False, None, None

    def outcome_to_persistence(self, state: GameState) -> Optional[str]:
        winner = state.get("winner")
        if winner is None:
            return None
        if winner == "draw":
            return "draw"
        if winner == state.get("player_symbol"):
            return "player_won"
        return "ai_won"


class TicTacToeAIStrategy(AIStrategy):
    def generate_move(self, state: GameState) -> tuple[Move, Optional[float]]:
        board = state["board"][:]
        ai_symbol = state["ai_symbol"]
        player_symbol = state["player_symbol"]

        best_score = -2
        best_move = -1
        for i in range(9):
            if board[i] is None:
                board[i] = ai_symbol
                score = _minimax(board, False, ai_symbol, player_symbol)
                board[i] = None
                if score > best_score:
                    best_score = score
                    best_move = i

        return best_move, float(best_score)
