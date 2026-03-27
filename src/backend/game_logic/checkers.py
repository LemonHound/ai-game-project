import random
from typing import Any, Dict, List, Optional


class CheckersGame:

    def get_initial_state(
        self, difficulty: str = "medium", player_starts: bool = True
    ) -> Dict[str, Any]:
        board = ["_"] * 64
        for pos in [40, 42, 44, 46, 49, 51, 53, 55, 56, 58, 60, 62]:
            board[pos] = "R"
        for pos in [1, 3, 5, 7, 8, 10, 12, 14, 17, 19, 21, 23]:
            board[pos] = "B"
        return {
            "board": board,
            "current_player": "R" if player_starts else "B",
            "player_symbol": "R",
            "ai_symbol": "B",
            "game_over": False,
            "winner": None,
            "must_capture": None,
            "difficulty": difficulty,
            "player_starts": player_starts,
        }

    def apply_move(
        self, game_state: Dict[str, Any], move: Dict[str, Any]
    ) -> Dict[str, Any]:
        import copy

        gs = copy.deepcopy(game_state)

        if gs["game_over"]:
            raise ValueError("Game is already over")

        if "chain" in move:
            for single in move["chain"]:
                from_pos = single.get("from")
                to_pos = single.get("to")
                if from_pos is None or to_pos is None:
                    raise ValueError("Invalid move format in chain")
                if not self._is_valid_move(gs, from_pos, to_pos):
                    raise ValueError(f"Invalid move in chain: {from_pos} to {to_pos}")
                self._execute_move(gs, from_pos, to_pos)
        else:
            from_pos = move.get("from")
            to_pos = move.get("to")
            if from_pos is None or to_pos is None:
                raise ValueError("Invalid move format")
            if not self._is_valid_move(gs, from_pos, to_pos):
                raise ValueError("Invalid move")
            self._execute_move(gs, from_pos, to_pos)

        player_move = move
        winner = self._check_winner(gs)
        if winner:
            gs["game_over"] = True
            gs["winner"] = winner
            player_board = copy.deepcopy(gs)
            return {
                "player_move": player_move,
                "board_after_player": player_board,
                "game_over_after_player": True,
                "ai_move": None,
                "board_after_ai": None,
                "game_over": True,
                "winner": winner,
            }

        player_board = copy.deepcopy(gs)

        gs["current_player"] = "B"
        ai_move = self._get_ai_move_chain(gs)

        winner = self._check_winner(gs)
        game_over = bool(winner)
        if game_over:
            gs["game_over"] = True
            gs["winner"] = winner
        else:
            gs["current_player"] = "R"

        ai_board = copy.deepcopy(gs)

        return {
            "player_move": player_move,
            "board_after_player": player_board,
            "game_over_after_player": False,
            "ai_move": ai_move,
            "board_after_ai": ai_board,
            "game_over": game_over,
            "winner": winner,
        }

    def _get_ai_move_chain(
        self, game_state: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        move_chain = []
        current_pos = None
        last_was_capture = False

        while True:
            if current_pos is None:
                board = game_state["board"]
                ai_pieces = [i for i in range(64) if board[i] in ["B", "b"]]

                capture_moves = []
                for pos in ai_pieces:
                    moves = self._get_valid_moves_for_piece(game_state, pos)
                    capture_moves.extend(m for m in moves if m["captures"])

                if capture_moves:
                    chosen = random.choice(capture_moves)
                else:
                    all_moves = []
                    for pos in ai_pieces:
                        all_moves.extend(self._get_valid_moves_for_piece(game_state, pos))
                    if not all_moves:
                        return None
                    chosen = random.choice(all_moves)

                captured = self._execute_move(game_state, chosen["from"], chosen["to"])
                move_chain.append({"from": chosen["from"], "to": chosen["to"], "captures": captured})
                current_pos = chosen["to"]
                last_was_capture = len(captured) > 0
                if not last_was_capture:
                    break
            else:
                if not last_was_capture:
                    break
                additional = self._get_valid_moves_for_piece(game_state, current_pos)
                captures = [m for m in additional if m["captures"]]
                if not captures:
                    break
                chosen = random.choice(captures)
                captured = self._execute_move(game_state, chosen["from"], chosen["to"])
                move_chain.append({"from": chosen["from"], "to": chosen["to"], "captures": captured})
                current_pos = chosen["to"]
                last_was_capture = len(captured) > 0

        if len(move_chain) > 1:
            return {"chain": move_chain}
        return move_chain[0] if move_chain else None

    def _is_valid_move(
        self, game_state: Dict[str, Any], from_pos: int, to_pos: int
    ) -> bool:
        if not (0 <= from_pos < 64 and 0 <= to_pos < 64):
            return False
        board = game_state["board"]
        piece = board[from_pos]
        current = game_state["current_player"]
        if piece == "_":
            return False
        if current == "R" and piece not in ["R", "r"]:
            return False
        if current == "B" and piece not in ["B", "b"]:
            return False
        if board[to_pos] != "_":
            return False
        valid = self._get_valid_moves_for_piece(game_state, from_pos)
        return any(m["to"] == to_pos for m in valid)

    def _get_valid_moves_for_piece(
        self, game_state: Dict[str, Any], pos: int
    ) -> List[Dict[str, Any]]:
        board = game_state["board"]
        piece = board[pos]
        if piece == "_":
            return []

        player = "R" if piece in ["R", "r"] else "B"
        captures = self._calculate_captures_for_piece(game_state, pos)

        if self._has_any_captures_available(game_state, player):
            return captures

        moves = []
        row, col = pos // 8, pos % 8
        if piece == "R":
            directions = [(-1, -1), (-1, 1)]
        elif piece == "B":
            directions = [(1, -1), (1, 1)]
        else:
            directions = [(-1, -1), (-1, 1), (1, -1), (1, 1)]

        for dr, dc in directions:
            nr, nc = row + dr, col + dc
            if 0 <= nr < 8 and 0 <= nc < 8:
                npos = nr * 8 + nc
                if (nr + nc) % 2 == 1 and board[npos] == "_":
                    moves.append({"from": pos, "to": npos, "captures": []})

        return moves

    def _has_any_captures_available(
        self, game_state: Dict[str, Any], player: str
    ) -> bool:
        board = game_state["board"]
        pieces = ["R", "r"] if player == "R" else ["B", "b"]
        for i in range(64):
            if board[i] in pieces:
                if self._calculate_captures_for_piece(game_state, i):
                    return True
        return False

    def _calculate_captures_for_piece(
        self, game_state: Dict[str, Any], pos: int
    ) -> List[Dict[str, Any]]:
        board = game_state["board"]
        piece = board[pos]
        if piece == "_":
            return []

        row, col = pos // 8, pos % 8
        if piece == "R":
            directions = [(-1, -1), (-1, 1)]
        elif piece == "B":
            directions = [(1, -1), (1, 1)]
        else:
            directions = [(-1, -1), (-1, 1), (1, -1), (1, 1)]

        captures = []
        for dr, dc in directions:
            nr, nc = row + dr, col + dc
            if 0 <= nr < 8 and 0 <= nc < 8:
                npos = nr * 8 + nc
                if (nr + nc) % 2 == 1 and board[npos] != "_" and self._is_opponent_piece(
                    piece, board[npos]
                ):
                    jr, jc = nr + dr, nc + dc
                    if 0 <= jr < 8 and 0 <= jc < 8:
                        jpos = jr * 8 + jc
                        if board[jpos] == "_":
                            captures.append({"from": pos, "to": jpos, "captures": [npos]})
        return captures

    def _is_opponent_piece(self, piece: str, other: str) -> bool:
        if piece in ["R", "r"]:
            return other in ["B", "b"]
        if piece in ["B", "b"]:
            return other in ["R", "r"]
        return False

    def _execute_move(
        self, game_state: Dict[str, Any], from_pos: int, to_pos: int
    ) -> List[int]:
        board = game_state["board"]
        piece = board[from_pos]
        captured = []
        board[from_pos] = "_"

        from_row, from_col = from_pos // 8, from_pos % 8
        to_row, to_col = to_pos // 8, to_pos % 8

        if abs(to_row - from_row) == 2:
            mid_row = (from_row + to_row) // 2
            mid_col = (from_col + to_col) // 2
            mid_pos = mid_row * 8 + mid_col
            board[mid_pos] = "_"
            captured.append(mid_pos)

        if piece == "R" and to_row == 0:
            piece = "r"
        elif piece == "B" and to_row == 7:
            piece = "b"

        board[to_pos] = piece
        return captured

    def _check_winner(self, game_state: Dict[str, Any]) -> Optional[str]:
        board = game_state["board"]
        red = sum(1 for p in board if p in ["R", "r"])
        black = sum(1 for p in board if p in ["B", "b"])
        if red == 0:
            return "B"
        if black == 0:
            return "R"
        current = game_state["current_player"]
        for i in range(64):
            if current == "R" and board[i] in ["R", "r"]:
                if self._get_valid_moves_for_piece(game_state, i):
                    return None
            elif current == "B" and board[i] in ["B", "b"]:
                if self._get_valid_moves_for_piece(game_state, i):
                    return None
        return "B" if current == "R" else "R"


checkers_game = CheckersGame()
