import random
from typing import Any, Dict, List, Optional, Tuple


class ChessGame:

    def get_initial_state(
        self, difficulty: str = "medium", player_starts: bool = True
    ) -> Dict[str, Any]:
        state = {
            "board": self._create_initial_board(),
            "current_player": "white",
            "player_color": "white" if player_starts else "black",
            "game_active": True,
            "king_positions": {"white": [7, 4], "black": [0, 4]},
            "castling_rights": {
                "white": {"kingside": True, "queenside": True},
                "black": {"kingside": True, "queenside": True},
            },
            "en_passant_target": None,
            "captured_pieces": {"player": [], "ai": []},
            "difficulty": difficulty,
            "player_starts": player_starts,
        }
        if not player_starts:
            self._generate_ai_move(state)
        return state

    def apply_move(
        self, game_state: Dict[str, Any], move: Dict[str, Any]
    ) -> Dict[str, Any]:
        import copy

        gs = copy.deepcopy(game_state)

        if not gs["game_active"]:
            raise ValueError("Game is not active")
        if gs["current_player"] != gs["player_color"]:
            raise ValueError("Not player's turn")

        from_row = move["fromRow"]
        from_col = move["fromCol"]
        to_row = move["toRow"]
        to_col = move["toCol"]
        promotion_piece = move.get("promotionPiece")

        if not self._execute_move(gs, from_row, from_col, to_row, to_col, promotion_piece):
            raise ValueError("Invalid move")

        player_move_dict = {
            "fromRow": from_row,
            "fromCol": from_col,
            "toRow": to_row,
            "toCol": to_col,
        }
        player_board = copy.deepcopy(gs)

        game_over, winner = self._check_game_end(gs)
        if game_over:
            return {
                "player_move": player_move_dict,
                "board_after_player": player_board,
                "game_over_after_player": True,
                "ai_move": None,
                "board_after_ai": None,
                "game_over": True,
                "winner": winner,
            }

        ai_move = self._generate_ai_move(gs)
        ai_board = copy.deepcopy(gs)
        game_over, winner = self._check_game_end(gs)

        return {
            "player_move": player_move_dict,
            "board_after_player": player_board,
            "game_over_after_player": False,
            "ai_move": ai_move,
            "board_after_ai": ai_board,
            "game_over": game_over,
            "winner": winner,
        }

    def _generate_ai_move(self, game_state: Dict) -> Optional[Dict]:
        ai_color = "white" if game_state["player_color"] == "black" else "black"

        for _ in range(500):
            ai_pieces = [
                (r, c, game_state["board"][r][c])
                for r in range(8)
                for c in range(8)
                if game_state["board"][r][c]
                and self._is_piece_color(game_state["board"][r][c], ai_color)
            ]
            if not ai_pieces:
                return None

            from_row, from_col, piece = random.choice(ai_pieces)
            valid_moves = self._get_valid_moves(game_state, from_row, from_col)
            if not valid_moves:
                continue

            to_row, to_col = random.choice(valid_moves)
            promotion_piece = None
            if piece.lower() == "p":
                promotion_rank = 0 if ai_color == "white" else 7
                if to_row == promotion_rank:
                    promotion_piece = "Q" if ai_color == "white" else "q"

            if self._execute_move(
                game_state, from_row, from_col, to_row, to_col, promotion_piece
            ):
                return {
                    "fromRow": from_row,
                    "fromCol": from_col,
                    "toRow": to_row,
                    "toCol": to_col,
                    "piece": piece,
                    "promotionPiece": promotion_piece,
                }

        raise ValueError("AI could not generate a valid move after 500 attempts")

    def _execute_move(
        self,
        game_state: Dict,
        from_row: int,
        from_col: int,
        to_row: int,
        to_col: int,
        promotion_piece: Optional[str] = None,
    ) -> bool:
        board = game_state["board"]
        piece = board[from_row][from_col]
        if not piece:
            return False

        is_white = self._is_white_piece(piece)
        current_color = "white" if is_white else "black"

        if current_color != game_state["current_player"]:
            return False

        valid_moves = self._get_valid_moves(game_state, from_row, from_col)
        if [to_row, to_col] not in valid_moves:
            return False

        captured = board[to_row][to_col]
        final_piece = promotion_piece if promotion_piece else piece

        if piece.lower() == "k" and abs(to_col - from_col) == 2:
            is_kingside = to_col > from_col
            rook_from_col = 7 if is_kingside else 0
            rook_to_col = to_col - 1 if is_kingside else to_col + 1
            board[to_row][to_col] = piece
            board[from_row][from_col] = None
            board[from_row][rook_to_col] = board[from_row][rook_from_col]
            board[from_row][rook_from_col] = None
            game_state["king_positions"][current_color] = [to_row, to_col]
        elif (
            piece.lower() == "p"
            and game_state["en_passant_target"]
            and to_row == game_state["en_passant_target"][0]
            and to_col == game_state["en_passant_target"][1]
        ):
            captured_row = to_row + 1 if is_white else to_row - 1
            captured_pawn = board[captured_row][to_col]
            if captured_pawn:
                captured = captured_pawn
            board[captured_row][to_col] = None
            board[to_row][to_col] = final_piece
            board[from_row][from_col] = None
        else:
            board[to_row][to_col] = final_piece
            board[from_row][from_col] = None
            if piece.lower() == "k":
                game_state["king_positions"][current_color] = [to_row, to_col]

        if piece.lower() == "k":
            game_state["castling_rights"][current_color]["kingside"] = False
            game_state["castling_rights"][current_color]["queenside"] = False
        elif piece.lower() == "r":
            if from_col == 0:
                game_state["castling_rights"][current_color]["queenside"] = False
            if from_col == 7:
                game_state["castling_rights"][current_color]["kingside"] = False

        if piece.lower() == "p" and abs(to_row - from_row) == 2:
            game_state["en_passant_target"] = [
                from_row - 1 if is_white else from_row + 1,
                from_col,
            ]
        else:
            game_state["en_passant_target"] = None

        if captured:
            key = "player" if current_color == game_state["player_color"] else "ai"
            game_state["captured_pieces"][key].append(captured)

        game_state["current_player"] = (
            "black" if game_state["current_player"] == "white" else "white"
        )
        return True

    def _get_valid_moves(
        self, game_state: Dict, row: int, col: int
    ) -> List[List[int]]:
        board = game_state["board"]
        piece = board[row][col]
        if not piece:
            return []

        pt = piece.lower()
        if pt == "p":
            moves = self._get_pawn_moves(game_state, row, col)
        elif pt == "r":
            moves = self._get_linear_moves(
                game_state, row, col, [[0, 1], [0, -1], [1, 0], [-1, 0]]
            )
        elif pt == "b":
            moves = self._get_linear_moves(
                game_state, row, col, [[1, 1], [1, -1], [-1, 1], [-1, -1]]
            )
        elif pt == "q":
            moves = self._get_linear_moves(
                game_state,
                row,
                col,
                [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]],
            )
        elif pt == "n":
            moves = self._get_knight_moves(game_state, row, col)
        elif pt == "k":
            moves = self._get_king_moves(game_state, row, col)
        else:
            moves = []

        return [m for m in moves if not self._would_be_in_check(game_state, row, col, m[0], m[1])]

    def _get_pawn_moves(self, game_state: Dict, row: int, col: int) -> List[List[int]]:
        board = game_state["board"]
        piece = board[row][col]
        is_white = self._is_white_piece(piece)
        direction = -1 if is_white else 1
        start_row = 6 if is_white else 1
        moves = []

        if 0 <= row + direction < 8 and not board[row + direction][col]:
            moves.append([row + direction, col])
            if row == start_row and not board[row + 2 * direction][col]:
                moves.append([row + 2 * direction, col])

        for dcol in [-1, 1]:
            nr, nc = row + direction, col + dcol
            if 0 <= nr < 8 and 0 <= nc < 8:
                target = board[nr][nc]
                if target and self._is_white_piece(target) != is_white:
                    moves.append([nr, nc])
                ep = game_state["en_passant_target"]
                if ep and nr == ep[0] and nc == ep[1]:
                    moves.append([nr, nc])

        return moves

    def _get_knight_moves(self, game_state: Dict, row: int, col: int) -> List[List[int]]:
        board = game_state["board"]
        piece = board[row][col]
        is_white = self._is_white_piece(piece)
        moves = []
        for dr, dc in [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]:
            nr, nc = row + dr, col + dc
            if 0 <= nr < 8 and 0 <= nc < 8:
                t = board[nr][nc]
                if not t or self._is_white_piece(t) != is_white:
                    moves.append([nr, nc])
        return moves

    def _get_king_moves(self, game_state: Dict, row: int, col: int) -> List[List[int]]:
        board = game_state["board"]
        piece = board[row][col]
        is_white = self._is_white_piece(piece)
        color = "white" if is_white else "black"
        moves = []
        for dr, dc in [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]:
            nr, nc = row + dr, col + dc
            if 0 <= nr < 8 and 0 <= nc < 8:
                t = board[nr][nc]
                if not t or self._is_white_piece(t) != is_white:
                    moves.append([nr, nc])
        if self._can_castle(game_state, color, True):
            moves.append([row, col + 2])
        if self._can_castle(game_state, color, False):
            moves.append([row, col - 2])
        return moves

    def _get_linear_moves(
        self, game_state: Dict, row: int, col: int, directions: List[List[int]]
    ) -> List[List[int]]:
        board = game_state["board"]
        piece = board[row][col]
        is_white = self._is_white_piece(piece)
        moves = []
        for dr, dc in directions:
            for i in range(1, 8):
                nr, nc = row + dr * i, col + dc * i
                if not (0 <= nr < 8 and 0 <= nc < 8):
                    break
                t = board[nr][nc]
                if not t:
                    moves.append([nr, nc])
                else:
                    if self._is_white_piece(t) != is_white:
                        moves.append([nr, nc])
                    break
        return moves

    def _can_castle(self, game_state: Dict, color: str, kingside: bool) -> bool:
        rights = game_state["castling_rights"][color]
        if not rights["kingside" if kingside else "queenside"]:
            return False
        if self._is_in_check(game_state, color):
            return False
        king_pos = game_state["king_positions"][color]
        king_row, king_col = king_pos
        rook_col = 7 if kingside else 0
        direction = 1 if kingside else -1
        board = game_state["board"]
        for col in range(king_col + direction, rook_col, direction):
            if board[king_row][col]:
                return False
        for i in range(3):
            if self._is_square_attacked(game_state, king_row, king_col + i * direction, color):
                return False
        return True

    def _would_be_in_check(
        self, game_state: Dict, from_row: int, from_col: int, to_row: int, to_col: int
    ) -> bool:
        board = game_state["board"]
        piece = board[from_row][from_col]
        original = board[to_row][to_col]
        board[to_row][to_col] = piece
        board[from_row][from_col] = None
        is_white = self._is_white_piece(piece)
        color = "white" if is_white else "black"
        original_king_pos = None
        if piece.lower() == "k":
            original_king_pos = game_state["king_positions"][color][:]
            game_state["king_positions"][color] = [to_row, to_col]
        in_check = self._is_in_check(game_state, color)
        board[from_row][from_col] = piece
        board[to_row][to_col] = original
        if original_king_pos:
            game_state["king_positions"][color] = original_king_pos
        return in_check

    def _is_in_check(self, game_state: Dict, color: str) -> bool:
        kp = game_state["king_positions"][color]
        return self._is_square_attacked(game_state, kp[0], kp[1], color)

    def _is_square_attacked(
        self, game_state: Dict, row: int, col: int, defending_color: str
    ) -> bool:
        attacking = "black" if defending_color == "white" else "white"
        for r in range(8):
            for c in range(8):
                piece = game_state["board"][r][c]
                if piece and self._is_piece_color(piece, attacking):
                    if [row, col] in self._get_piece_attacks(game_state, r, c):
                        return True
        return False

    def _get_piece_attacks(self, game_state: Dict, row: int, col: int) -> List[List[int]]:
        board = game_state["board"]
        piece = board[row][col]
        if not piece:
            return []
        pt = piece.lower()
        if pt == "p":
            is_white = self._is_white_piece(piece)
            direction = -1 if is_white else 1
            return [
                [row + direction, col + dc]
                for dc in [-1, 1]
                if 0 <= row + direction < 8 and 0 <= col + dc < 8
            ]
        elif pt == "n":
            return self._get_knight_moves(game_state, row, col)
        elif pt == "b":
            return self._get_linear_moves(
                game_state, row, col, [[1, 1], [1, -1], [-1, 1], [-1, -1]]
            )
        elif pt == "r":
            return self._get_linear_moves(
                game_state, row, col, [[0, 1], [0, -1], [1, 0], [-1, 0]]
            )
        elif pt == "q":
            return self._get_linear_moves(
                game_state,
                row,
                col,
                [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]],
            )
        elif pt == "k":
            return [
                [row + dr, col + dc]
                for dr, dc in [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]
                if 0 <= row + dr < 8 and 0 <= col + dc < 8
            ]
        return []

    def _check_game_end(self, game_state: Dict) -> Tuple[bool, Optional[str]]:
        color = game_state["current_player"]
        if self._is_checkmate(game_state, color):
            winner = "black" if color == "white" else "white"
            game_state["game_active"] = False
            return True, winner
        if self._is_stalemate(game_state, color):
            game_state["game_active"] = False
            return True, "draw"
        return False, None

    def _is_checkmate(self, game_state: Dict, color: str) -> bool:
        return self._is_in_check(game_state, color) and not self._has_valid_moves(
            game_state, color
        )

    def _is_stalemate(self, game_state: Dict, color: str) -> bool:
        return not self._is_in_check(game_state, color) and not self._has_valid_moves(
            game_state, color
        )

    def _has_valid_moves(self, game_state: Dict, color: str) -> bool:
        for r in range(8):
            for c in range(8):
                piece = game_state["board"][r][c]
                if piece and self._is_piece_color(piece, color):
                    if self._get_valid_moves(game_state, r, c):
                        return True
        return False

    def _is_white_piece(self, piece: str) -> bool:
        return piece == piece.upper()

    def _is_piece_color(self, piece: str, color: str) -> bool:
        return (color == "white") == self._is_white_piece(piece)

    def _create_initial_board(self) -> List[List[Optional[str]]]:
        return [
            ["r", "n", "b", "q", "k", "b", "n", "r"],
            ["p", "p", "p", "p", "p", "p", "p", "p"],
            [None] * 8,
            [None] * 8,
            [None] * 8,
            [None] * 8,
            ["P", "P", "P", "P", "P", "P", "P", "P"],
            ["R", "N", "B", "Q", "K", "B", "N", "R"],
        ]


chess_game = ChessGame()
