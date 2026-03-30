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
    def validate_move(self, state: GameState, move: Move) -> bool:
        """Returns True if the move is legal in the given state, False otherwise.

        Does not mutate state. Called before apply_move; also used by MoveProcessor
        to validate AI-generated moves before applying them.

        Args:
            state: Current game state dict.
            move: Move representation for this game type (int for TTT, dict for chess, etc.).
        """
        ...

    @abstractmethod
    def apply_move(self, state: GameState, move: Move) -> GameState:
        """Applies a validated move and returns the resulting game state.

        Does not mutate the input state — returns a new dict. Callers must pass
        a move that has already been validated via validate_move.

        Args:
            state: Current game state dict.
            move: Validated move to apply.

        Returns:
            New game state dict after the move is applied.
        """
        ...

    @abstractmethod
    def is_terminal(self, state: GameState) -> tuple[bool, Optional[str]]:
        """Returns (is_terminal, outcome) where outcome is 'player_won'|'ai_won'|'draw'|None.

        Args:
            state: Current game state dict.

        Returns:
            Tuple of (is_terminal, outcome). outcome is None when is_terminal is False.
        """
        ...

    @abstractmethod
    def get_legal_moves(self, state: GameState) -> list[Move]:
        """Returns all legal moves available to the current player in the given state.

        Used by MoveProcessor as the fallback pool when the AI exceeds max_retries.
        The returned list is guaranteed non-empty for any non-terminal state.

        Args:
            state: Current game state dict.

        Returns:
            List of move objects in the format expected by validate_move and apply_move.
        """
        ...

    @abstractmethod
    def initial_state(self, player_starts: bool) -> GameState:
        """Returns the starting game state for a new session.

        The returned dict is stored as board_state on the game record at creation
        and is the canonical starting point for move replay.

        Args:
            player_starts: If True, it is the player's turn first. If False, the AI
                moves first (the router calls process_ai_turn before returning /newgame).

        Returns:
            Initial game state dict suitable for passing to apply_move and is_terminal.
        """
        ...


class AIStrategy(ABC):
    @abstractmethod
    def generate_move(self, state: GameState) -> tuple[Move, Optional[float]]:
        """Returns (move, engine_eval). Move may be invalid; no guarantee of validity.

        The returned move is passed to GameEngine.validate_move by MoveProcessor. If
        invalid, MoveProcessor retries up to max_retries times before falling back to a
        random legal move from get_legal_moves. The engine_eval float is currently unused
        by the router but may be logged or stored in future iterations.

        Args:
            state: Current game state dict. current_turn is set to "ai" by the caller.

        Returns:
            Tuple of (move, engine_eval). engine_eval may be None. Move format must match
            what the corresponding GameEngine expects (e.g. dict with fromRow/toRow for chess).
        """
        ...


class MoveProcessor:
    def process_player_move(
        self, engine: GameEngine, state: GameState, move: Move
    ) -> GameState:
        """Validates and applies a player move.

        Args:
            engine: GameEngine instance for this game type.
            state: Current game state. Must have current_turn == "player".
            move: Move submitted by the player.

        Returns:
            New game state after the move is applied.

        Raises:
            ValueError: If it is not the player's turn or the move is invalid.
        """
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
        """Generates and applies the AI's move, with retry and random fallback.

        Calls strategy.generate_move up to max_retries times. If all attempts produce
        invalid moves, selects a random move from engine.get_legal_moves. The fallback
        guarantees a valid move is always applied for non-terminal states.

        Args:
            engine: GameEngine instance for this game type.
            strategy: AIStrategy instance whose generate_move will be called.
            state: Current game state (after the player's move).
            max_retries: Maximum AI attempts before falling back to a random legal move.

        Returns:
            Tuple of (new_state, engine_eval). engine_eval is None on fallback.
        """
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
