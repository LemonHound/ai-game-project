"""Checkers game engine with minimax AI strategy."""
import copy
from typing import Optional

from game_engine.base import AIStrategy, GameEngine, GameState, Move
from game_logic.checkers import checkers_game


class CheckersEngine(GameEngine):
    """GameEngine implementation for Checkers with mandatory captures and chain moves."""

    def initial_state(self, player_starts: bool) -> GameState:
        """Return the starting state dict for a new Checkers game.

        Board is a 64-element flat list. R/r = red (player), B/b = black (AI),
        lowercase = king, _ = empty.

        Args:
            player_starts: If True, player (red) moves first.

        Returns:
            GameState with board, current_turn, game_active, player_starts,
            player_symbol, ai_symbol, must_capture, last_move, legal_pieces.
        """
        board = ["_"] * 64
        for pos in [40, 42, 44, 46, 49, 51, 53, 55, 56, 58, 60, 62]:
            board[pos] = "R"
        for pos in [1, 3, 5, 7, 8, 10, 12, 14, 17, 19, 21, 23]:
            board[pos] = "B"
        player_symbol = "R" if player_starts else "B"
        ai_symbol = "B" if player_starts else "R"
        state = {
            "board": board,
            "current_turn": "player" if player_starts else "ai",
            "game_active": True,
            "player_starts": player_starts,
            "player_symbol": player_symbol,
            "ai_symbol": ai_symbol,
            "must_capture": None,
            "last_move": None,
            "legal_pieces": [],
        }
        state["legal_pieces"] = self._compute_legal_pieces(state)
        return state

    def validate_move(self, state: GameState, move: Move) -> bool:
        """Return True if the move is legal, accounting for mandatory capture rules.

        Args:
            state: Current game state.
            move: Dict with keys "from" (int) and "to" (int) — flat board indices.

        Returns:
            True if the move is a valid step or capture for the current player.
        """
        if not state.get("game_active", False):
            return False
        from_pos = move.get("from")
        to_pos = move.get("to")
        if from_pos is None or to_pos is None:
            return False
        must_capture = state.get("must_capture")
        if must_capture is not None:
            if from_pos != must_capture:
                return False
            captures = checkers_game._calculate_captures_for_piece(
                self._to_legacy_state(state), from_pos
            )
            if not any(m["to"] == to_pos for m in captures):
                return False
        legacy = self._to_legacy_state(state)
        return checkers_game._is_valid_move(legacy, from_pos, to_pos)

    def apply_move(self, state: GameState, move: Move) -> GameState:
        """Execute a single step or capture and return the updated state.

        If the move results in a multi-capture opportunity, sets must_capture to
        force the next move from the same piece.

        Args:
            state: Current game state.
            move: Dict with keys "from" and "to" (flat board indices).

        Returns:
            New GameState with updated board, last_move, must_capture, and legal_pieces.
        """
        from_pos = move["from"]
        to_pos = move["to"]
        new_board = state["board"][:]
        legacy = {
            "board": new_board,
            "current_player": state["player_symbol"] if state["current_turn"] == "player" else state["ai_symbol"],
            "player_symbol": state["player_symbol"],
            "ai_symbol": state["ai_symbol"],
            "game_over": not state.get("game_active", True),
            "winner": None,
            "must_capture": state.get("must_capture"),
            "difficulty": "medium",
            "player_starts": state["player_starts"],
        }
        piece_before = new_board[from_pos]
        captured = checkers_game._execute_move(legacy, from_pos, to_pos)
        piece_after = new_board[to_pos]
        is_king_promotion = piece_before != piece_after

        last_move = {
            "from": from_pos,
            "to": to_pos,
            "captured": captured,
            "is_king_promotion": is_king_promotion,
        }

        new_state = {
            **state,
            "board": new_board,
            "last_move": last_move,
        }

        if captured and not is_king_promotion:
            further_captures = checkers_game._calculate_captures_for_piece(
                {"board": new_board, "current_player": legacy["current_player"]},
                to_pos,
            )
            if further_captures:
                new_state["must_capture"] = to_pos
                new_state["legal_pieces"] = [to_pos]
                return new_state

        new_state["must_capture"] = None
        new_state["current_turn"] = "ai" if state["current_turn"] == "player" else "player"
        new_state["legal_pieces"] = self._compute_legal_pieces(new_state)
        return new_state

    def is_terminal(self, state: GameState) -> tuple[bool, Optional[str]]:
        """Check whether the game has ended (no pieces or no legal moves).

        Args:
            state: Current game state.

        Returns:
            (True, "player_won"|"ai_won") if terminal, (False, None) otherwise.
        """
        if not state.get("game_active", True):
            return True, None
        board = state["board"]
        player_symbol = state["player_symbol"]
        ai_symbol = state["ai_symbol"]
        player_king = player_symbol.lower()
        ai_king = ai_symbol.lower()

        player_count = sum(1 for p in board if p in (player_symbol, player_king))
        ai_count = sum(1 for p in board if p in (ai_symbol, ai_king))

        if player_count == 0:
            return True, "ai_won"
        if ai_count == 0:
            return True, "player_won"

        current_turn = state.get("current_turn")
        if current_turn == "player":
            current_symbol = player_symbol
        else:
            current_symbol = ai_symbol

        legacy = self._to_legacy_state(state)
        legacy["current_player"] = current_symbol
        has_moves = False
        pieces = [current_symbol, current_symbol.lower()]
        for i in range(64):
            if board[i] in pieces:
                if checkers_game._get_valid_moves_for_piece(legacy, i):
                    has_moves = True
                    break

        if not has_moves:
            if current_turn == "player":
                return True, "ai_won"
            return True, "player_won"

        return False, None

    def get_legal_moves(self, state: GameState) -> list[Move]:
        """Return all legal moves for the current player.

        Captures are mandatory: if any capture is available, only capture moves
        are returned. Respects must_capture for chain capture continuation.

        Args:
            state: Current game state.

        Returns:
            List of dicts `{"from": int, "to": int}`.
        """
        current_turn = state.get("current_turn")
        if current_turn == "player":
            symbol = state["player_symbol"]
        else:
            symbol = state["ai_symbol"]
        legacy = self._to_legacy_state(state)
        legacy["current_player"] = symbol
        pieces = [symbol, symbol.lower()]
        board = state["board"]
        moves = []
        must_capture = state.get("must_capture")
        if must_capture is not None:
            moves.extend(checkers_game._get_valid_moves_for_piece(legacy, must_capture))
            return [{"from": m["from"], "to": m["to"]} for m in moves]
        for i in range(64):
            if board[i] in pieces:
                piece_moves = checkers_game._get_valid_moves_for_piece(legacy, i)
                moves.extend({"from": m["from"], "to": m["to"]} for m in piece_moves)
        return moves

    def _to_legacy_state(self, state: GameState) -> dict:
        return {
            "board": state["board"][:],
            "current_player": state["player_symbol"] if state["current_turn"] == "player" else state["ai_symbol"],
            "player_symbol": state["player_symbol"],
            "ai_symbol": state["ai_symbol"],
            "game_over": not state.get("game_active", True),
            "winner": None,
            "must_capture": state.get("must_capture"),
            "difficulty": "medium",
            "player_starts": state["player_starts"],
        }

    def _compute_legal_pieces(self, state: GameState) -> list[int]:
        current_turn = state.get("current_turn")
        if current_turn == "player":
            symbol = state["player_symbol"]
        else:
            symbol = state["ai_symbol"]

        must_capture = state.get("must_capture")
        if must_capture is not None:
            return [must_capture]

        board = state["board"]
        legacy = self._to_legacy_state(state)
        legacy["current_player"] = symbol
        pieces = [symbol, symbol.lower()]

        has_captures = checkers_game._has_any_captures_available(legacy, symbol)
        result = []
        for i in range(64):
            if board[i] in pieces:
                if has_captures:
                    if checkers_game._calculate_captures_for_piece(legacy, i):
                        result.append(i)
                else:
                    if checkers_game._get_valid_moves_for_piece(legacy, i):
                        result.append(i)
        return result


class CheckersAIStrategy(AIStrategy):
    """Random-capture AI strategy for Checkers using the legacy game logic chain generator."""

    def generate_move(self, state: GameState) -> tuple[Move, Optional[float]]:
        """Select an AI move (first step of a potential chain) using random capture priority.

        Args:
            state: Current game state where it is the AI's turn.

        Returns:
            Tuple of ({"from": int, "to": int}, None) — no eval score is returned.
        """
        legacy = {
            "board": state["board"][:],
            "current_player": state["ai_symbol"],
            "player_symbol": state["player_symbol"],
            "ai_symbol": state["ai_symbol"],
            "game_over": not state.get("game_active", True),
            "winner": None,
            "must_capture": state.get("must_capture"),
            "difficulty": "medium",
            "player_starts": state["player_starts"],
        }
        result = checkers_game._get_ai_move_chain(legacy)
        if result is None:
            return {"from": -1, "to": -1}, None
        if "chain" in result:
            first = result["chain"][0]
        else:
            first = result
        return {"from": first["from"], "to": first["to"]}, None
