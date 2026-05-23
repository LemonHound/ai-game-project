from __future__ import annotations
import threading
import time
from typing import Any

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
