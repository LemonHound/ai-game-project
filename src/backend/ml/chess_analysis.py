from __future__ import annotations
import threading
import time
from typing import Any

from game_engine.chess_engine import ChessEngine
from ml.models import AnalysisLimits


_MATERIAL_VALUES: dict[str, float] = {"p": 1, "n": 3, "b": 3, "r": 5, "q": 9}
_MAX_MATERIAL = 39.0


class AnalysisSession:
    def __init__(self, limits: AnalysisLimits) -> None:
        self.limits = limits
        self.depth_reached: int = 0
        self.positions_analyzed: int = 0
        self._start_time = time.monotonic()
        self._cutoff_reason: str | None = None
        self._timed_out = threading.Event()
        self._timer: threading.Timer | None = None

        if limits.max_time_ms is not None:
            self._timer = threading.Timer(
                limits.max_time_ms / 1000.0,
                self._on_timeout,
            )
            self._timer.daemon = True
            self._timer.start()

    def _on_timeout(self) -> None:
        self._timed_out.set()

    def should_continue(self, confidence: float | None = None) -> bool:
        if self._timed_out.is_set():
            if self._cutoff_reason is None:
                self._cutoff_reason = "time"
            return False
        if (
            self.limits.max_positions is not None
            and self.positions_analyzed >= self.limits.max_positions
        ):
            if self._cutoff_reason is None:
                self._cutoff_reason = "positions"
            return False
        if (
            self.limits.min_confidence is not None
            and confidence is not None
            and confidence < self.limits.min_confidence
        ):
            if self._cutoff_reason is None:
                self._cutoff_reason = "confidence"
            return False
        return True

    def elapsed_ms(self) -> int:
        return int((time.monotonic() - self._start_time) * 1000)

    def cancel_timer(self) -> None:
        if self._timer is not None:
            self._timer.cancel()

    @property
    def cutoff_reason(self) -> str | None:
        return self._cutoff_reason


def _material_score(state: dict[str, Any], for_color: str) -> float:
    score = 0.0
    for row in state["board"]:
        for piece in row:
            if not piece:
                continue
            piece_color = "white" if piece == piece.upper() else "black"
            value = _MATERIAL_VALUES.get(piece.lower(), 0.0)
            score += value if piece_color == for_color else -value
    return max(0.0, min(1.0, (score + _MAX_MATERIAL) / (2.0 * _MAX_MATERIAL)))


def _move_to_dict(move: dict[str, Any]) -> dict[str, Any]:
    return {
        "from_row": move["fromRow"],
        "from_col": move["fromCol"],
        "to_row": move["toRow"],
        "to_col": move["toCol"],
        "promotion_piece": move.get("promotionPiece"),
    }


def expand_position(state: dict[str, Any]) -> list[dict[str, Any]]:
    engine = ChessEngine()
    moving_player: str = state.get("current_player", "white")
    results = []
    for move in engine.get_legal_moves(state):
        child = engine.apply_move(state, move)
        terminal, terminal_outcome = engine.is_terminal(child)
        last_move = child.get("last_move") or {}
        results.append({
            "move": _move_to_dict(move),
            "notation": last_move.get("notation"),
            "state": child,
            "is_terminal": terminal,
            "terminal_outcome": terminal_outcome,
            "eval_score": _material_score(child, moving_player),
        })
    return results


def analyze_position(state: dict[str, Any], limits: AnalysisLimits) -> dict[str, Any]:
    session = AnalysisSession(limits)
    best_move: dict[str, Any] | None = None
    best_score = float("-inf")
    best_notation: str | None = None
    try:
        best_move, best_score, best_notation = _dfs(state, session, limits, depth=0)
    finally:
        session.cancel_timer()

    cutoff = session.cutoff_reason or ("exhausted" if best_move is not None else None)
    return {
        "best_move": _move_to_dict(best_move) if best_move else None,
        "best_move_notation": best_notation,
        "confidence": best_score if best_score != float("-inf") else None,
        "analysis": {
            "depth_reached": session.depth_reached,
            "positions_analyzed": session.positions_analyzed,
            "time_elapsed_ms": session.elapsed_ms(),
            "cutoff_reason": cutoff,
        },
    }


def _dfs(
    state: dict[str, Any],
    session: AnalysisSession,
    limits: AnalysisLimits,
    depth: int,
) -> tuple[dict[str, Any] | None, float, str | None]:
    if not session.should_continue():
        return None, float("-inf"), None

    engine = ChessEngine()
    moving_player: str = state.get("current_player", "white")
    legal_moves = engine.get_legal_moves(state)
    if not legal_moves:
        return None, float("-inf"), None

    best_move: dict[str, Any] | None = None
    best_score = float("-inf")
    best_notation: str | None = None

    for move in legal_moves:
        if not session.should_continue():
            break

        child = engine.apply_move(state, move)
        session.positions_analyzed += 1
        session.depth_reached = max(session.depth_reached, depth + 1)
        score = _material_score(child, moving_player)

        if not session.should_continue(confidence=score):
            if score > best_score:
                best_score = score
                best_move = move
                last_move = child.get("last_move") or {}
                best_notation = last_move.get("notation")
            break

        terminal, _ = engine.is_terminal(child)
        depth_ok = limits.max_depth is None or depth + 1 < limits.max_depth
        if depth_ok and not terminal:
            _, child_score, _ = _dfs(child, session, limits, depth + 1)
            if child_score != float("-inf"):
                score = child_score

        if score > best_score:
            best_score = score
            best_move = move
            last_move = child.get("last_move") or {}
            best_notation = last_move.get("notation")

    return best_move, best_score, best_notation
