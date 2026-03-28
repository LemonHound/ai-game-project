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
    def initial_state(self, player_starts: bool) -> GameState:
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
        valid = chess_game._get_valid_moves(state, from_row, from_col)
        return [{"toRow": tr, "toCol": tc} for tr, tc in valid]

    def outcome_to_persistence(self, state: GameState) -> Optional[str]:
        terminal, outcome = self.is_terminal(state)
        if not terminal:
            return None
        return outcome


class ChessAIStrategy(AIStrategy):
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
