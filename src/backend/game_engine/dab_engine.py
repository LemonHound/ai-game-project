from typing import Optional

from game_engine.base import AIStrategy, GameEngine, GameState, Move
from game_logic.dots_and_boxes import DotsAndBoxes

dab_game = DotsAndBoxes()

TOTAL_BOXES = 16


def _to_legacy_state(state: GameState) -> dict:
    return {
        "grid_size": state["grid_size"],
        "horizontal_lines": dict(state["horizontal_lines"]),
        "vertical_lines": dict(state["vertical_lines"]),
        "boxes": dict(state["boxes"]),
        "current_player": "X" if state["current_turn"] == "player" else "O",
        "player_symbol": "X",
        "ai_symbol": "O",
        "player_score": state["player_score"],
        "ai_score": state["ai_score"],
        "game_over": not state.get("game_active", True),
        "winner": None,
        "move_count": state["move_count"],
        "difficulty": "medium",
        "player_starts": state["player_starts"],
    }


class DaBEngine(GameEngine):
    def initial_state(self, player_starts: bool) -> GameState:
        return {
            "grid_size": 4,
            "horizontal_lines": {},
            "vertical_lines": {},
            "boxes": {},
            "current_turn": "player" if player_starts else "ai",
            "game_active": True,
            "player_starts": player_starts,
            "player_score": 0,
            "ai_score": 0,
            "move_count": 0,
            "last_move": None,
        }

    def validate_move(self, state: GameState, move: Move) -> bool:
        if not state.get("game_active", False):
            return False
        if state.get("current_turn") != "player":
            return False
        if not isinstance(move, dict):
            return False
        legacy = _to_legacy_state(state)
        return dab_game._is_valid_move(legacy, move.get("type"), move.get("row"), move.get("col"))

    def apply_move(self, state: GameState, move: Move) -> GameState:
        owner = "player" if state["current_turn"] == "player" else "ai"
        legacy_player_symbol = "X" if owner == "player" else "O"

        legacy = _to_legacy_state(state)

        boxes_before = set(legacy["boxes"].keys())
        boxes_completed = dab_game._apply_line(
            legacy, move["type"], move["row"], move["col"], legacy_player_symbol
        )
        boxes_after = set(legacy["boxes"].keys())
        newly_claimed_keys = boxes_after - boxes_before
        newly_claimed_boxes = [
            {"row": int(k.split(",")[0]), "col": int(k.split(",")[1])}
            for k in newly_claimed_keys
        ]

        player_score = state["player_score"]
        ai_score = state["ai_score"]
        if owner == "player":
            player_score += boxes_completed
        else:
            ai_score += boxes_completed

        if boxes_completed > 0:
            current_turn = owner
        else:
            current_turn = "ai" if owner == "player" else "player"

        move_count = state["move_count"] + 1
        total_claimed = player_score + ai_score
        game_active = total_claimed < TOTAL_BOXES

        last_move = {
            "type": move["type"],
            "row": move["row"],
            "col": move["col"],
            "boxes_completed": boxes_completed,
            "newly_claimed_boxes": newly_claimed_boxes,
        }

        return {
            "grid_size": state["grid_size"],
            "horizontal_lines": legacy["horizontal_lines"],
            "vertical_lines": legacy["vertical_lines"],
            "boxes": legacy["boxes"],
            "current_turn": current_turn if game_active else state["current_turn"],
            "game_active": game_active,
            "player_starts": state["player_starts"],
            "player_score": player_score,
            "ai_score": ai_score,
            "move_count": move_count,
            "last_move": last_move,
        }

    def is_terminal(self, state: GameState) -> tuple[bool, Optional[str]]:
        if state["player_score"] + state["ai_score"] == TOTAL_BOXES:
            w = self.get_winner(state)
            outcome = "player_won" if w == "player" else ("ai_won" if w == "ai" else "draw")
            return True, outcome
        return False, None

    def get_winner(self, state: GameState) -> str:
        if state["player_score"] > state["ai_score"]:
            return "player"
        if state["ai_score"] > state["player_score"]:
            return "ai"
        return "draw"

    def get_legal_moves(self, state: GameState) -> list[Move]:
        legacy = _to_legacy_state(state)
        return dab_game._get_available_moves(legacy)


class DaBStrategy(AIStrategy):
    def generate_move(self, state: GameState) -> tuple[Move, Optional[float]]:
        legacy = _to_legacy_state(state)
        legacy["current_player"] = "O"
        move = dab_game._get_ai_move(legacy)
        if move is None:
            engine = DaBEngine()
            legal = engine.get_legal_moves(state)
            if not legal:
                return {}, None
            return legal[0], None
        return move, None
