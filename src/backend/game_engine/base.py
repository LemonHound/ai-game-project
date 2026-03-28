import asyncio
import logging
import random
import time
from abc import ABC, abstractmethod
from typing import Any, AsyncGenerator, Optional

logger = logging.getLogger(__name__)

GameState = dict[str, Any]
Move = Any


class GameEngine(ABC):
    @abstractmethod
    def validate_move(self, state: GameState, move: Move) -> bool: ...

    @abstractmethod
    def apply_move(self, state: GameState, move: Move) -> GameState: ...

    @abstractmethod
    def is_terminal(self, state: GameState) -> tuple[bool, Optional[str]]:
        """Returns (is_terminal, outcome) where outcome is 'player_won'|'ai_won'|'draw'|None."""
        ...

    @abstractmethod
    def get_legal_moves(self, state: GameState) -> list[Move]: ...

    @abstractmethod
    def initial_state(self, player_starts: bool) -> GameState: ...


class AIStrategy(ABC):
    @abstractmethod
    def generate_move(self, state: GameState) -> tuple[Move, Optional[float]]:
        """Returns (move, engine_eval). Move may be invalid; no guarantee of validity."""
        ...


class MoveProcessor:
    def process_player_move(
        self, engine: GameEngine, state: GameState, move: Move
    ) -> GameState:
        if state.get("current_turn") != "player":
            raise ValueError("Not player's turn")
        if not engine.validate_move(state, move):
            raise ValueError(f"Invalid move: {move}")
        return engine.apply_move(state, move)

    def process_ai_turn(
        self,
        engine: GameEngine,
        strategy: AIStrategy,
        state: GameState,
        max_retries: int = 5,
    ) -> tuple[GameState, Optional[float]]:
        ai_state = {**state, "current_turn": "ai"}
        for attempt in range(max_retries):
            move, score = strategy.generate_move(ai_state)
            if engine.validate_move(ai_state, move):
                return engine.apply_move(ai_state, move), score
            logger.warning(
                "ai_invalid_move",
                extra={"attempt": attempt + 1, "ai_invalid_move_count": attempt + 1},
            )
        legal = engine.get_legal_moves(ai_state)
        fallback = random.choice(legal)
        logger.warning(
            "ai_move_fallback_to_random",
            extra={"max_retries": max_retries},
        )
        return engine.apply_move(ai_state, fallback), None


_STATUS_INITIAL = "Thinking..."
_STATUS_INTERIM = ["Hmm...", "Considering the board...", "Plotting a move...", "Analyzing..."]
_STATUS_SLOW = ["Taking a moment...", "Almost there..."]


class StatusEvent:
    def __init__(self, type: str, **data: Any) -> None:
        self.type = type
        self.data = data

    def to_sse(self) -> str:
        import json

        if self.type == "heartbeat":
            return 'data: {"type": "heartbeat"}\n\n'
        if self.type == "status":
            return f'data: {json.dumps({"type": "status", "message": self.data["message"]})}\n\n'
        if self.type == "move":
            return f'data: {json.dumps({"type": "move", "data": self.data["payload"]})}\n\n'
        if self.type == "error":
            return f'data: {json.dumps({"type": "error", "code": self.data.get("code"), "message": self.data.get("message")})}\n\n'
        return f'data: {json.dumps({"type": self.type})}\n\n'


class StatusBroadcaster:
    """
    Rate-limits SSE events to a human-readable cadence.

    - min_interval: 2.5s between sends to client
    - First status held ~0.5s to prevent flash on near-instant AI responses
    - Heartbeat every 30s
    - Terminal event closes the stream
    """

    MIN_INTERVAL = 2.5
    INITIAL_HOLD = 0.5
    HEARTBEAT_INTERVAL = 30.0

    def __init__(self) -> None:
        self._queue: asyncio.Queue[StatusEvent] = asyncio.Queue()
        self._closed = False

    def emit(self, event: StatusEvent) -> None:
        if not self._closed:
            self._queue.put_nowait(event)

    async def stream(self) -> AsyncGenerator[str, None]:
        last_sent = time.monotonic()
        pending: Optional[StatusEvent] = None
        start = time.monotonic()

        while not self._closed:
            now = time.monotonic()
            elapsed_since_send = now - last_sent

            try:
                event = await asyncio.wait_for(
                    self._queue.get(), timeout=min(1.0, self.HEARTBEAT_INTERVAL)
                )
            except asyncio.TimeoutError:
                if elapsed_since_send >= self.HEARTBEAT_INTERVAL:
                    yield StatusEvent("heartbeat").to_sse()
                    last_sent = time.monotonic()
                continue

            if event.type in ("move", "error"):
                if pending is not None:
                    remaining = self.MIN_INTERVAL - (time.monotonic() - last_sent)
                    if remaining > 0:
                        await asyncio.sleep(remaining)
                    yield pending.to_sse()
                    last_sent = time.monotonic()
                    pending = None

                remaining = self.MIN_INTERVAL - (time.monotonic() - last_sent)
                if remaining > 0:
                    await asyncio.sleep(remaining)
                yield event.to_sse()
                last_sent = time.monotonic()

                if event.type == "move" and event.data.get("payload", {}).get("status") in (
                    "complete",
                    "abandoned",
                ):
                    self._closed = True
                    return
            elif event.type == "status":
                elapsed_total = time.monotonic() - start
                if elapsed_total < self.INITIAL_HOLD:
                    await asyncio.sleep(self.INITIAL_HOLD - elapsed_total)

                remaining = self.MIN_INTERVAL - (time.monotonic() - last_sent)
                if remaining > 0:
                    pending = event
                else:
                    if pending is not None:
                        yield pending.to_sse()
                        last_sent = time.monotonic()
                        await asyncio.sleep(self.MIN_INTERVAL)
                    yield event.to_sse()
                    last_sent = time.monotonic()
                    pending = None

    def close(self) -> None:
        self._closed = True
