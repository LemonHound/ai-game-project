"""Chess game engine wrapping the chess game logic with minimax AI."""
import copy
from typing import Optional

from game_engine.base import AIStrategy, GameEngine, GameState, Move
from game_logic.chess import chess_game

SEARCH_DEPTH = 2

PIECE_VALUES = {
    'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9, 'k': 0,
    'P': 1, 'N': 3, 'B': 3, 'R': 5, 'Q': 9, 'K': 0,
}

_POSITION_BONUSES = {
    'p': [
        [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
        [0.1, 0.1, 0.2, 0.3, 0.3, 0.2, 0.1, 0.1],
        [0.05, 0.05, 0.1, 0.25, 0.25, 0.1, 0.05, 0.05],
        [0.0, 0.0, 0.0, 0.2, 0.2, 0.0, 0.0, 0.0],
        [0.05, -0.05, -0.1, 0.0, 0.0, -0.1, -0.05, 0.05],
        [0.05, 0.1, 0.1, -0.2, -0.2, 0.1, 0.1, 0.05],
        [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
    ],
    'n': [
        [-0.5, -0.4, -0.3, -0.3, -0.3, -0.3, -0.4, -0.5],
        [-0.4, -0.2, 0.0, 0.0, 0.0, 0.0, -0.2, -0.4],
        [-0.3, 0.0, 0.1, 0.15, 0.15, 0.1, 0.0, -0.3],
        [-0.3, 0.05, 0.15, 0.2, 0.2, 0.15, 0.05, -0.3],
        [-0.3, 0.0, 0.15, 0.2, 0.2, 0.15, 0.0, -0.3],
        [-0.3, 0.05, 0.1, 0.15, 0.15, 0.1, 0.05, -0.3],
        [-0.4, -0.2, 0.0, 0.05, 0.05, 0.0, -0.2, -0.4],
        [-0.5, -0.4, -0.3, -0.3, -0.3, -0.3, -0.4, -0.5],
    ],
    'b': [
        [-0.2, -0.1, -0.1, -0.1, -0.1, -0.1, -0.1, -0.2],
        [-0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, -0.1],
        [-0.1, 0.0, 0.05, 0.1, 0.1, 0.05, 0.0, -0.1],
        [-0.1, 0.05, 0.05, 0.1, 0.1, 0.05, 0.05, -0.1],
        [-0.1, 0.0, 0.1, 0.1, 0.1, 0.1, 0.0, -0.1],
        [-0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, -0.1],
        [-0.1, 0.05, 0.0, 0.0, 0.0, 0.0, 0.05, -0.1],
        [-0.2, -0.1, -0.1, -0.1, -0.1, -0.1, -0.1, -0.2],
    ],
    'r': [
        [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        [0.05, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.05],
        [-0.05, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, -0.05],
        [-0.05, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, -0.05],
        [-0.05, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, -0.05],
        [-0.05, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, -0.05],
        [-0.05, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, -0.05],
        [0.0, 0.0, 0.0, 0.05, 0.05, 0.0, 0.0, 0.0],
    ],
    'q': [
        [-0.2, -0.1, -0.1, -0.05, -0.05, -0.1, -0.1, -0.2],
        [-0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, -0.1],
        [-0.1, 0.0, 0.05, 0.05, 0.05, 0.05, 0.0, -0.1],
        [-0.05, 0.0, 0.05, 0.05, 0.05, 0.05, 0.0, -0.05],
        [0.0, 0.0, 0.05, 0.05, 0.05, 0.05, 0.0, -0.05],
        [-0.1, 0.05, 0.05, 0.05, 0.05, 0.05, 0.0, -0.1],
        [-0.1, 0.0, 0.05, 0.0, 0.0, 0.0, 0.0, -0.1],
        [-0.2, -0.1, -0.1, -0.05, -0.05, -0.1, -0.1, -0.2],
    ],
    'k': [
        [-0.3, -0.4, -0.4, -0.5, -0.5, -0.4, -0.4, -0.3],
        [-0.3, -0.4, -0.4, -0.5, -0.5, -0.4, -0.4, -0.3],
        [-0.3, -0.4, -0.4, -0.5, -0.5, -0.4, -0.4, -0.3],
        [-0.3, -0.4, -0.4, -0.5, -0.5, -0.4, -0.4, -0.3],
        [-0.2, -0.3, -0.3, -0.4, -0.4, -0.3, -0.3, -0.2],
        [-0.1, -0.2, -0.2, -0.2, -0.2, -0.2, -0.2, -0.1],
        [0.2, 0.2, 0.0, 0.0, 0.0, 0.0, 0.2, 0.2],
        [0.2, 0.3, 0.1, 0.0, 0.0, 0.1, 0.3, 0.2],
    ],
}

_COLS = "abcdefgh"


class ChessEngine(GameEngine):
    """GameEngine implementation for chess.

    State shape (the dict stored in chess_games.board_state):
        board: 8×8 list of lists. Row 0 = black back rank, row 7 = white back rank.
            Uppercase = white pieces (K Q R B N P), lowercase = black (k q r b n p), None = empty.
        current_player: "white" | "black" — whose turn it is to move.
        player_color: "white" | "black" — which color the human player controls. Fixed for the session.
        game_active: bool — False once a terminal state is reached.
        player_starts: bool — whether the human player moved first (stored for display).
        king_positions: {"white": [row, col], "black": [row, col]}.
        castling_rights: {"white": {"kingside": bool, "queenside": bool}, "black": {...}}.
        en_passant_target: [row, col] of the en passant capture square, or None.
        captured_pieces: {"player": list[str], "ai": list[str]} — piece chars of captured pieces.
        last_move: dict with fromRow/fromCol/toRow/toCol/piece/captured/is_castling/is_en_passant/
            promotion/notation, or None if no move has been made.
        in_check: bool — True if current_player's king is in check.
        fen: str — FEN string after the most recent move (set by apply_move).
    """

    def initial_state(self, player_starts: bool) -> GameState:
        """Returns the opening chess position as a game state dict.

        Args:
            player_starts: If True, player controls white and moves first.
                If False, player controls black and the AI (white) moves first.

        Returns:
            Full game state dict with the standard starting position.
        """
        return {
            "board": chess_game._create_initial_board(),
            "current_player": "white",
            "player_color": "white" if player_starts else "black",
            "game_active": True,
            "player_starts": player_starts,
            "king_positions": {"white": [7, 4], "black": [0, 4]},
            "castling_rights": {
                "white": {"kingside": True, "queenside": True},
                "black": {"kingside": True, "queenside": True},
            },
            "en_passant_target": None,
            "captured_pieces": {"player": [], "ai": []},
            "last_move": None,
            "in_check": False,
        }

    def validate_move(self, state: GameState, move: Move) -> bool:
        """Returns True if the move is pseudo-legal for the current player.

        Checks that the piece exists, belongs to current_player, and that the
        destination is in the piece's legal move list (which already accounts for
        check, pins, castling legality, and en passant).

        Args:
            state: Current game state dict.
            move: Dict with fromRow, fromCol, toRow, toCol (all int). promotionPiece is ignored here.

        Returns:
            False if game_active is False, the move fields are missing, no piece is at the source,
            the piece does not belong to current_player, or the destination is not a legal target.
        """
        if not state.get("game_active", False):
            return False
        from_row = move.get("fromRow")
        from_col = move.get("fromCol")
        to_row = move.get("toRow")
        to_col = move.get("toCol")
        if any(v is None for v in [from_row, from_col, to_row, to_col]):
            return False
        piece = state["board"][from_row][from_col]
        if not piece:
            return False
        is_white = piece == piece.upper()
        piece_color = "white" if is_white else "black"
        if piece_color != state["current_player"]:
            return False
        valid = chess_game._get_valid_moves(state, from_row, from_col)
        return [to_row, to_col] in valid

    def apply_move(self, state: GameState, move: Move) -> GameState:
        """Applies a validated move and returns a new game state.

        Handles all special cases: castling (moves rook alongside king), en passant
        (removes captured pawn), pawn promotion (replaces pawn with promotionPiece).
        Updates last_move, in_check, and fen on the returned state.

        Args:
            state: Current game state dict.
            move: Dict with fromRow, fromCol, toRow, toCol (all int) and optional
                promotionPiece (str, e.g. "Q"). Must be validated before calling.

        Returns:
            New game state dict. Does not mutate the input state.
        """
        gs = copy.deepcopy(state)
        from_row = move["fromRow"]
        from_col = move["fromCol"]
        to_row = move["toRow"]
        to_col = move["toCol"]
        promotion = move.get("promotionPiece")

        piece = gs["board"][from_row][from_col]
        captured_piece = gs["board"][to_row][to_col]

        is_ep = (
            piece and piece.lower() == "p"
            and from_col != to_col
            and captured_piece is None
        )

        chess_game._execute_move(gs, from_row, from_col, to_row, to_col, promotion)

        in_check = chess_game._is_in_check(gs, gs["current_player"])

        notation = self._make_san(move, piece, state, gs, captured_piece, is_ep)

        last_move = {
            "fromRow": from_row,
            "fromCol": from_col,
            "toRow": to_row,
            "toCol": to_col,
            "piece": piece,
            "captured": captured_piece,
            "is_castling": piece.lower() == "k" and abs(to_col - from_col) == 2 if piece else False,
            "is_en_passant": is_ep,
            "promotion": promotion,
            "notation": notation,
        }

        gs["last_move"] = last_move
        gs["in_check"] = in_check
        gs["fen"] = self._to_fen(gs)
        return gs

    def _make_san(
        self,
        move: dict,
        piece: Optional[str],
        pre_state: dict,
        post_state: dict,
        captured_piece: Optional[str],
        is_ep: bool,
    ) -> str:
        if not piece:
            return "?"
        from_col = move["fromCol"]
        to_row = move["toRow"]
        to_col = move["toCol"]
        promotion = move.get("promotionPiece")
        tc = _COLS[to_col]
        tr = 8 - to_row

        # Castling
        if piece.lower() == "k" and abs(to_col - from_col) == 2:
            notation = "O-O" if to_col > from_col else "O-O-O"
        elif piece.lower() == "p":
            is_capture = captured_piece is not None or is_ep
            if is_capture:
                notation = f"{_COLS[from_col]}x{tc}{tr}"
            else:
                notation = f"{tc}{tr}"
            if promotion:
                notation += f"={promotion.upper()}"
        else:
            piece_char = piece.upper()
            disambig = self._get_disambiguation(pre_state, piece, move["fromRow"], from_col, to_row, to_col)
            is_capture = captured_piece is not None
            if is_capture:
                notation = f"{piece_char}{disambig}x{tc}{tr}"
            else:
                notation = f"{piece_char}{disambig}{tc}{tr}"

        # Check / checkmate suffix
        next_color = post_state.get("current_player")
        if next_color and chess_game._is_in_check(post_state, next_color):
            terminal, _ = self.is_terminal(post_state)
            notation += "#" if terminal else "+"

        return notation

    def _get_disambiguation(
        self, pre_state: dict, piece: str, from_row: int, from_col: int, to_row: int, to_col: int
    ) -> str:
        board = pre_state["board"]
        ambiguous: list[tuple[int, int]] = []
        for r in range(8):
            for c in range(8):
                if r == from_row and c == from_col:
                    continue
                if board[r][c] != piece:
                    continue
                valid = chess_game._get_valid_moves(pre_state, r, c)
                if [to_row, to_col] in valid:
                    ambiguous.append((r, c))
        if not ambiguous:
            return ""
        files_distinct = all(c != from_col for _, c in ambiguous)
        if files_distinct:
            return _COLS[from_col]
        ranks_distinct = all(r != from_row for r, _ in ambiguous)
        if ranks_distinct:
            return str(8 - from_row)
        return f"{_COLS[from_col]}{8 - from_row}"

    def _to_fen(self, state: dict) -> str:
        board = state["board"]
        rows = []
        for row in board:
            empty = 0
            row_str = ""
            for cell in row:
                if cell is None:
                    empty += 1
                else:
                    if empty:
                        row_str += str(empty)
                        empty = 0
                    row_str += cell
            if empty:
                row_str += str(empty)
            rows.append(row_str)
        pieces = "/".join(rows)

        turn = "w" if state.get("current_player") == "white" else "b"

        cr = state.get("castling_rights", {})
        castling = ""
        if cr.get("white", {}).get("kingside"):
            castling += "K"
        if cr.get("white", {}).get("queenside"):
            castling += "Q"
        if cr.get("black", {}).get("kingside"):
            castling += "k"
        if cr.get("black", {}).get("queenside"):
            castling += "q"
        if not castling:
            castling = "-"

        ep = state.get("en_passant_target")
        ep_str = f"{_COLS[ep[1]]}{8 - ep[0]}" if ep else "-"

        return f"{pieces} {turn} {castling} {ep_str} 0 1"

    def is_terminal(self, state: GameState) -> tuple[bool, Optional[str]]:
        """Returns (is_terminal, outcome) for the given chess state.

        Delegates to chess_game._check_game_end for checkmate and draw detection
        (stalemate, insufficient material, 50-move rule, etc.).

        Args:
            state: Current game state dict.

        Returns:
            (True, "player_won") if the AI is checkmated.
            (True, "ai_won") if the player is checkmated.
            (True, "draw") on any draw condition.
            (False, None) if the game is still in progress.
        """
        state_copy = copy.deepcopy(state)
        game_over, winner_color = chess_game._check_game_end(state_copy)
        if not game_over:
            return False, None
        if winner_color == "draw":
            return True, "draw"
        if winner_color == state["player_color"]:
            return True, "player_won"
        return True, "ai_won"

    def get_legal_moves(self, state: GameState) -> list[Move]:
        """Returns all legal moves for current_player in the given state.

        Iterates every square, finds pieces belonging to current_player, and collects
        their valid destinations. Pawn promotions are expanded to queen promotions only
        (matching the AI strategy's promotion handling).

        Args:
            state: Current game state dict.

        Returns:
            List of move dicts, each with fromRow, fromCol, toRow, toCol, promotionPiece.
        """
        current_color = state["current_player"]
        moves = []
        board = state["board"]
        for r in range(8):
            for c in range(8):
                piece = board[r][c]
                if not piece:
                    continue
                is_white = piece == piece.upper()
                piece_color = "white" if is_white else "black"
                if piece_color != current_color:
                    continue
                valid = chess_game._get_valid_moves(state, r, c)
                for tr, tc in valid:
                    if piece.lower() == "p":
                        back_rank = 0 if piece == "P" else 7
                        if tr == back_rank:
                            promo = "Q" if piece == "P" else "q"
                            moves.append({"fromRow": r, "fromCol": c, "toRow": tr, "toCol": tc, "promotionPiece": promo})
                            continue
                    moves.append({"fromRow": r, "fromCol": c, "toRow": tr, "toCol": tc, "promotionPiece": None})
        return moves

    def get_legal_moves_for_square(self, state: GameState, from_row: int, from_col: int) -> list[dict]:
        """Returns legal destination squares for the piece at (from_row, from_col).

        Used by the legal-moves API endpoint to populate the frontend move highlights.

        Args:
            state: Current game state dict.
            from_row: Row index of the piece (0 = black back rank, 7 = white back rank).
            from_col: Column index of the piece (0 = a-file, 7 = h-file).

        Returns:
            List of dicts with toRow and toCol for each reachable square.
        """
        valid = chess_game._get_valid_moves(state, from_row, from_col)
        return [{"toRow": tr, "toCol": tc} for tr, tc in valid]

    def outcome_to_persistence(self, state: GameState) -> Optional[str]:
        """Return the persistence outcome string for the given terminal state, or None."""
        terminal, outcome = self.is_terminal(state)
        if not terminal:
            return None
        return outcome


class ChessAIStrategy(AIStrategy):
    """AIStrategy implementation for chess using minimax with alpha-beta pruning.

    Uses material balance plus per-piece position tables for evaluation. Search depth
    is controlled by SEARCH_DEPTH (default 2). To replace this with an external engine
    or ML model, subclass AIStrategy and implement generate_move — see the AI integration
    guide in features/documentation/spec.md.
    """

    def _evaluate(self, state: GameState) -> float:
        ai_color = "white" if state["player_color"] == "black" else "black"
        score = 0.0
        board = state["board"]
        for r in range(8):
            for c in range(8):
                piece = board[r][c]
                if not piece:
                    continue
                is_white = piece == piece.upper()
                piece_color = "white" if is_white else "black"
                pt = piece.lower()
                value = PIECE_VALUES.get(piece, 0)
                bonus_table = _POSITION_BONUSES.get(pt)
                if bonus_table:
                    bonus_row = r if not is_white else 7 - r
                    bonus = bonus_table[bonus_row][c]
                else:
                    bonus = 0.0
                total = value + bonus
                if piece_color == ai_color:
                    score += total
                else:
                    score -= total
        return score

    def _minimax(self, engine: ChessEngine, state: dict, depth: int, alpha: float, beta: float, is_maximizing: bool) -> float:
        terminal, outcome = engine.is_terminal(state)
        if terminal:
            if outcome == "ai_won":
                return 1000.0
            if outcome == "player_won":
                return -1000.0
            return 0.0
        if depth == 0:
            return self._evaluate(state)

        moves = engine.get_legal_moves(state)
        if not moves:
            return 0.0

        if is_maximizing:
            max_eval = float('-inf')
            for move in moves:
                child = engine.apply_move(state, move)
                eval_score = self._minimax(engine, child, depth - 1, alpha, beta, False)
                max_eval = max(max_eval, eval_score)
                alpha = max(alpha, eval_score)
                if beta <= alpha:
                    break
            return max_eval
        else:
            min_eval = float('inf')
            for move in moves:
                child = engine.apply_move(state, move)
                eval_score = self._minimax(engine, child, depth - 1, alpha, beta, True)
                min_eval = min(min_eval, eval_score)
                beta = min(beta, eval_score)
                if beta <= alpha:
                    break
            return min_eval

    def generate_move(self, state: GameState) -> tuple[Move, Optional[float]]:
        """Selects the best move via minimax with alpha-beta pruning.

        Evaluates all legal moves at the current state to SEARCH_DEPTH plies.
        Pawn promotions default to queen. The returned engine_eval is normalized to [-1, 1]
        (positive = AI advantage).

        Args:
            state: Current game state dict with current_player set to the AI's color.

        Returns:
            Tuple of (best_move_dict, normalized_eval). Returns (None, None) if no legal
            moves exist (should not occur for non-terminal states).
        """
        engine = ChessEngine()
        moves = engine.get_legal_moves(state)
        if not moves:
            return None, None

        best_move = None
        best_score = float('-inf')
        for move in moves:
            child = engine.apply_move(state, move)
            score = self._minimax(engine, child, SEARCH_DEPTH - 1, float('-inf'), float('inf'), False)
            if score > best_score:
                best_score = score
                best_move = move

        if best_move:
            piece = state["board"][best_move["fromRow"]][best_move["fromCol"]]
            if piece and piece.lower() == "p" and best_move.get("promotionPiece") is None:
                back_rank = 0 if piece == "P" else 7
                if best_move["toRow"] == back_rank:
                    promo = "Q" if piece == "P" else "q"
                    best_move = {**best_move, "promotionPiece": promo}

        normalized = max(-1.0, min(1.0, best_score / 1000.0))
        return best_move, normalized
