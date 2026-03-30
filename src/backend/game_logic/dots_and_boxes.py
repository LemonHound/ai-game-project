import copy
import random
from typing import Any, Dict, List, Optional


class DotsAndBoxes:
    """Dots and Boxes game logic for a configurable grid size with greedy AI."""

    def get_initial_state(
        self, difficulty: str = "medium", player_starts: bool = True, grid_size: int = 4
    ) -> Dict[str, Any]:
        """Return the starting board state for a new Dots and Boxes game.

        Lines are stored as dicts keyed by "row,col" strings. Boxes are claimed
        when all four surrounding lines are drawn.

        Args:
            difficulty: AI difficulty level — "easy" or "medium".
            player_starts: If True, player (X) moves first.
            grid_size: Number of boxes per side (default 4 gives a 4×4 grid).

        Returns:
            dict with keys: grid_size, horizontal_lines, vertical_lines, boxes,
            current_player, player_symbol, ai_symbol, player_score, ai_score,
            game_over, winner, move_count, difficulty, player_starts.
        """
        return {
            "grid_size": grid_size,
            "horizontal_lines": {},
            "vertical_lines": {},
            "boxes": {},
            "current_player": "X" if player_starts else "O",
            "player_symbol": "X",
            "ai_symbol": "O",
            "player_score": 0,
            "ai_score": 0,
            "game_over": False,
            "winner": None,
            "move_count": 0,
            "difficulty": difficulty,
            "player_starts": player_starts,
        }

    def apply_move(
        self, game_state: Dict[str, Any], move: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Apply a player line draw, then let the AI take all available scoring moves.

        Move format: `{"type": "horizontal"|"vertical", "row": int, "col": int}`.
        The AI continues playing while it can complete boxes (extra-turn rule).

        Args:
            game_state: Current game state dict from get_initial_state or a prior apply_move.
            move: Player move dict with type, row, and col.

        Returns:
            dict with keys: player_move, board_after_player, game_over_after_player,
            ai_moves (list), board_after_ai, game_over, winner.

        Raises:
            ValueError: If the game is over or the move targets an already-drawn line.
        """
        gs = copy.deepcopy(game_state)

        if gs["game_over"]:
            raise ValueError("Game is already over")

        line_type = move.get("type")
        row = move.get("row")
        col = move.get("col")

        if not self._is_valid_move(gs, line_type, row, col):
            raise ValueError("Invalid move")

        boxes_completed = self._apply_line(gs, line_type, row, col, gs["current_player"])
        gs["move_count"] += 1

        if boxes_completed > 0:
            gs["player_score"] += boxes_completed
        else:
            gs["current_player"] = "O"

        total_boxes = gs["grid_size"] * gs["grid_size"]
        if gs["player_score"] + gs["ai_score"] >= total_boxes:
            gs["game_over"] = True
            gs["winner"] = self._determine_winner(gs)
            player_board = copy.deepcopy(gs)
            return {
                "player_move": move,
                "board_after_player": player_board,
                "game_over_after_player": True,
                "ai_moves": [],
                "board_after_ai": None,
                "game_over": True,
                "winner": gs["winner"],
            }

        player_board = copy.deepcopy(gs)

        ai_moves = []
        while gs["current_player"] == "O" and not gs["game_over"]:
            ai_move = self._get_ai_move(gs)
            if not ai_move:
                break

            ai_boxes = self._apply_line(gs, ai_move["type"], ai_move["row"], ai_move["col"], "O")
            gs["move_count"] += 1
            ai_moves.append({**ai_move, "boxes_completed": ai_boxes})

            if ai_boxes > 0:
                gs["ai_score"] += ai_boxes
            else:
                gs["current_player"] = "X"
                break

            if gs["player_score"] + gs["ai_score"] >= total_boxes:
                gs["game_over"] = True
                gs["winner"] = self._determine_winner(gs)
                break

        ai_board = copy.deepcopy(gs)

        return {
            "player_move": move,
            "board_after_player": player_board,
            "game_over_after_player": False,
            "ai_moves": ai_moves,
            "board_after_ai": ai_board,
            "game_over": gs["game_over"],
            "winner": gs["winner"],
        }

    def _determine_winner(self, gs: Dict[str, Any]) -> str:
        if gs["player_score"] > gs["ai_score"]:
            return "X"
        if gs["ai_score"] > gs["player_score"]:
            return "O"
        return "tie"

    def _is_valid_move(
        self, game_state: Dict[str, Any], line_type: str, row: int, col: int
    ) -> bool:
        grid = game_state["grid_size"]
        if line_type == "horizontal":
            if not (0 <= row <= grid and 0 <= col < grid):
                return False
            return f"{row},{col}" not in game_state["horizontal_lines"]
        if line_type == "vertical":
            if not (0 <= row < grid and 0 <= col <= grid):
                return False
            return f"{row},{col}" not in game_state["vertical_lines"]
        return False

    def _apply_line(
        self, game_state: Dict[str, Any], line_type: str, row: int, col: int, player: str
    ) -> int:
        key = f"{row},{col}"
        grid = game_state["grid_size"]
        if line_type == "horizontal":
            game_state["horizontal_lines"][key] = player
        else:
            game_state["vertical_lines"][key] = player

        boxes_completed = 0
        if line_type == "horizontal":
            if row > 0 and self._is_box_complete(game_state, row - 1, col):
                game_state["boxes"][f"{row - 1},{col}"] = player
                boxes_completed += 1
            if row < grid and self._is_box_complete(game_state, row, col):
                game_state["boxes"][f"{row},{col}"] = player
                boxes_completed += 1
        else:
            if col > 0 and self._is_box_complete(game_state, row, col - 1):
                game_state["boxes"][f"{row},{col - 1}"] = player
                boxes_completed += 1
            if col < grid and self._is_box_complete(game_state, row, col):
                game_state["boxes"][f"{row},{col}"] = player
                boxes_completed += 1

        return boxes_completed

    def _is_box_complete(self, game_state: Dict[str, Any], row: int, col: int) -> bool:
        h = game_state["horizontal_lines"]
        v = game_state["vertical_lines"]
        return (
            f"{row},{col}" in h
            and f"{row + 1},{col}" in h
            and f"{row},{col}" in v
            and f"{row},{col + 1}" in v
        )

    def _box_has_n_sides(
        self, game_state: Dict[str, Any], row: int, col: int, n: int
    ) -> bool:
        h = game_state["horizontal_lines"]
        v = game_state["vertical_lines"]
        sides = sum([
            f"{row},{col}" in h,
            f"{row + 1},{col}" in h,
            f"{row},{col}" in v,
            f"{row},{col + 1}" in v,
        ])
        return sides == n

    def _get_available_moves(self, game_state: Dict[str, Any]) -> List[Dict[str, Any]]:
        grid = game_state["grid_size"]
        moves = []
        for r in range(grid + 1):
            for c in range(grid):
                if f"{r},{c}" not in game_state["horizontal_lines"]:
                    moves.append({"type": "horizontal", "row": r, "col": c})
        for r in range(grid):
            for c in range(grid + 1):
                if f"{r},{c}" not in game_state["vertical_lines"]:
                    moves.append({"type": "vertical", "row": r, "col": c})
        return moves

    def _would_complete_box(self, game_state: Dict[str, Any], move: Dict[str, Any]) -> bool:
        temp = {
            "grid_size": game_state["grid_size"],
            "horizontal_lines": game_state["horizontal_lines"].copy(),
            "vertical_lines": game_state["vertical_lines"].copy(),
        }
        key = f"{move['row']},{move['col']}"
        if move["type"] == "horizontal":
            temp["horizontal_lines"][key] = "test"
        else:
            temp["vertical_lines"][key] = "test"

        grid = game_state["grid_size"]
        if move["type"] == "horizontal":
            if move["row"] > 0 and self._is_box_complete(temp, move["row"] - 1, move["col"]):
                return True
            if move["row"] < grid and self._is_box_complete(temp, move["row"], move["col"]):
                return True
        else:
            if move["col"] > 0 and self._is_box_complete(temp, move["row"], move["col"] - 1):
                return True
            if move["col"] < grid and self._is_box_complete(temp, move["row"], move["col"]):
                return True
        return False

    def _would_give_box(self, game_state: Dict[str, Any], move: Dict[str, Any]) -> bool:
        grid = game_state["grid_size"]
        if move["type"] == "horizontal":
            if move["row"] > 0 and self._box_has_n_sides(game_state, move["row"] - 1, move["col"], 2):
                return True
            if move["row"] < grid and self._box_has_n_sides(game_state, move["row"], move["col"], 2):
                return True
        else:
            if move["col"] > 0 and self._box_has_n_sides(game_state, move["row"], move["col"] - 1, 2):
                return True
            if move["col"] < grid and self._box_has_n_sides(game_state, move["row"], move["col"], 2):
                return True
        return False

    def _get_ai_move(self, game_state: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        available = self._get_available_moves(game_state)
        if not available:
            return None

        if game_state["difficulty"] == "easy":
            return random.choice(available)

        for move in available:
            if self._would_complete_box(game_state, move):
                return move

        safe = [m for m in available if not self._would_give_box(game_state, m)]
        if safe:
            return random.choice(safe)

        return random.choice(available)


dots_and_boxes_game = DotsAndBoxes()
