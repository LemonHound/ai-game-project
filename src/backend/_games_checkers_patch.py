"""
Checkers endpoint patch for games.py.

Integration steps:
1. Add to models.py:
       class CheckersNewGameRequest(BaseModel):
           player_starts: bool = True
       class CheckersMoveRequest(BaseModel):
           from_pos: int
           to_pos: int
2. In games.py imports, add:
       from game_engine.checkers_engine import CheckersEngine, CheckersAIStrategy
       from models import CheckersNewGameRequest, CheckersMoveRequest
3. After the TTT setup block, add the four setup lines below.
4. Copy the four endpoint functions into games.py.
"""

import asyncio
import time
from typing import Optional
from uuid import UUID

from fastapi import Depends, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from opentelemetry import trace
from sqlalchemy.ext.asyncio import AsyncSession

import persistence_service
from db import db_dependency
from game_engine.base import MoveProcessor, StatusBroadcaster, StatusEvent
from game_engine.checkers_engine import CheckersAIStrategy, CheckersEngine

# --- add these four lines alongside the TTT equivalents in games.py ---
_checkers_engine = CheckersEngine()
_checkers_strategy = CheckersAIStrategy()
_checkers_processor = MoveProcessor()
_checkers_move_queues: dict[UUID, asyncio.Queue] = {}


def _checkers_state_payload(state: dict, move: Optional[dict] = None, player: Optional[str] = None) -> dict:
    from_pos = move["from"] if move else None
    to_pos = move["to"] if move else None
    captured = move.get("captured", []) if move else []
    is_king = move.get("is_king_promotion", False) if move else False
    terminal, outcome = _checkers_engine.is_terminal(state)
    winner = None
    if terminal:
        if outcome == "player_won":
            winner = "player"
        elif outcome == "ai_won":
            winner = "ai"
    return {
        "from": from_pos,
        "to": to_pos,
        "captured": captured,
        "player": player,
        "is_king_promotion": is_king,
        "board": state["board"],
        "player_starts": state["player_starts"],
        "current_turn": state.get("current_turn") if not terminal else None,
        "must_capture": state.get("must_capture"),
        "legal_pieces": state.get("legal_pieces", []),
        "status": "complete" if terminal else "in_progress",
        "winner": winner,
    }


# ============================================
# CHECKERS (SSE ARCHITECTURE)
# ============================================

# NOTE: router, logger, tracer, _ai_duration, _require_user, persistence_service
#       are all already available in games.py — do not redefine them here.


async def checkers_resume(
    user: dict = Depends(None),  # replace with Depends(_require_user)
    db: AsyncSession = Depends(db_dependency),
):
    span = trace.get_current_span()
    span.set_attribute("game.id", "checkers")

    session = await persistence_service.get_active_session_by_user_game(db, user["id"], "checkers")
    if not session:
        return {"session_id": None, "state": None}

    span.set_attribute("game.session_id", str(session.id))
    state = await persistence_service.get_latest_board_state(db, session.id, "checkers")
    return {"session_id": str(session.id), "state": state}


async def checkers_newgame(
    request,  # CheckersNewGameRequest
    user: dict = Depends(None),  # replace with Depends(_require_user)
    db: AsyncSession = Depends(db_dependency),
):
    span = trace.get_current_span()
    span.set_attribute("game.id", "checkers")

    existing = await persistence_service.get_active_session_by_user_game(db, user["id"], "checkers")
    if existing:
        q = _checkers_move_queues.pop(existing.id, None)
        if q:
            q.put_nowait({"__close__": True})
        await persistence_service.close_session(db, existing.id)

    session = await persistence_service.create_game_session(db, user["id"], "checkers")
    span.set_attribute("game.session_id", str(session.id))

    state = _checkers_engine.initial_state(request.player_starts)

    if not request.player_starts:
        while state.get("current_turn") == "ai" and state.get("game_active", True):
            ai_state, _ = _checkers_processor.process_ai_turn(
                _checkers_engine, _checkers_strategy, state
            )
            await persistence_service.record_move(
                db, session.id, "checkers", "ai", ai_state.get("last_move"), ai_state
            )
            state = ai_state
            if state.get("must_capture") is None:
                break
    else:
        await persistence_service.record_move(db, session.id, "checkers", "setup", None, state)

    return {"session_id": str(session.id), "state": state}


async def checkers_move(
    request,  # CheckersMoveRequest
    user: dict = Depends(None),  # replace with Depends(_require_user)
    db: AsyncSession = Depends(db_dependency),
):
    span = trace.get_current_span()
    span.set_attribute("game.id", "checkers")

    session = await persistence_service.get_active_session_by_user_game(db, user["id"], "checkers")
    if not session:
        raise HTTPException(status_code=409, detail="No active session")

    span.set_attribute("game.session_id", str(session.id))

    state = await persistence_service.get_latest_board_state(db, session.id, "checkers")
    if not state:
        raise HTTPException(status_code=409, detail="No board state found")

    move = {"from": request.from_pos, "to": request.to_pos}
    if not _checkers_engine.validate_move(state, move):
        # logger.warning("checkers_invalid_move", extra={"from": request.from_pos, "to": request.to_pos})
        raise HTTPException(status_code=422, detail="Invalid move")

    q = _checkers_move_queues.get(session.id)
    if q:
        await q.put(move)

    return JSONResponse(status_code=202, content=None)


async def checkers_events(
    session_id: str,
    user: dict = Depends(None),  # replace with Depends(_require_user)
    db: AsyncSession = Depends(db_dependency),
):
    try:
        sid = UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID")

    game_session = await persistence_service.get_game_session_state(db, sid)
    if not game_session:
        raise HTTPException(status_code=404, detail="Session not found")
    if game_session.user_id != user["id"]:
        raise HTTPException(status_code=403, detail="Session does not belong to current user")
    if game_session.game_ended:
        raise HTTPException(status_code=410, detail="Session already closed")

    span = trace.get_current_span()
    span.set_attribute("game.id", "checkers")
    span.set_attribute("game.session_id", session_id)

    q: asyncio.Queue = asyncio.Queue()
    _checkers_move_queues[sid] = q

    broadcaster = StatusBroadcaster()

    async def process_moves():
        try:
            state = await persistence_service.get_latest_board_state(db, sid, "checkers")
            while True:
                try:
                    msg = await asyncio.wait_for(
                        q.get(), timeout=StatusBroadcaster.HEARTBEAT_INTERVAL + 1
                    )
                except asyncio.TimeoutError:
                    broadcaster.emit(StatusEvent("heartbeat"))
                    continue

                if msg.get("__close__"):
                    broadcaster.close()
                    return

                player_move = {"from": msg["from"], "to": msg["to"]}
                state = _checkers_engine.apply_move(state, player_move)
                await persistence_service.record_move(
                    db, sid, "checkers", "human", state.get("last_move"), state
                )

                is_terminal, outcome = _checkers_engine.is_terminal(state)
                if is_terminal:
                    outcome_str = outcome or "draw"
                    await persistence_service.end_game_session(db, sid, outcome_str, "checkers")
                    broadcaster.emit(
                        StatusEvent("move", payload=_checkers_state_payload(state, state.get("last_move"), "player"))
                    )
                    broadcaster.close()
                    return

                if state.get("must_capture") is not None:
                    broadcaster.emit(
                        StatusEvent("move", payload=_checkers_state_payload(state, state.get("last_move"), "player"))
                    )
                    continue

                broadcaster.emit(
                    StatusEvent("move", payload=_checkers_state_payload(state, state.get("last_move"), "player"))
                )
                broadcaster.emit(StatusEvent("status", message="Thinking..."))

                with tracer.start_as_current_span("game.ai.move") as ai_span:
                    ai_span.set_attribute("game.id", "checkers")
                    ai_span.set_attribute("game.session_id", session_id)
                    t0 = time.monotonic()

                    while state.get("current_turn") == "ai" and state.get("game_active", True):
                        move, _ = _checkers_strategy.generate_move(state)
                        if not _checkers_engine.validate_move({**state, "current_turn": "ai"}, move):
                            legal = _checkers_engine.get_legal_moves({**state, "current_turn": "ai"})
                            if not legal:
                                break
                            import random
                            move = random.choice(legal)

                        ai_state_tmp = {**state, "current_turn": "ai"}
                        state = _checkers_engine.apply_move(ai_state_tmp, move)
                        await persistence_service.record_move(
                            db, sid, "checkers", "ai", state.get("last_move"), state
                        )

                        is_terminal, outcome = _checkers_engine.is_terminal(state)
                        ai_payload = _checkers_state_payload(state, state.get("last_move"), "ai")
                        broadcaster.emit(StatusEvent("move", payload=ai_payload))
                        await asyncio.sleep(0.4)

                        if is_terminal:
                            outcome_str = outcome or "draw"
                            await persistence_service.end_game_session(db, sid, outcome_str, "checkers")
                            broadcaster.close()
                            return

                        if state.get("must_capture") is None:
                            break

                    compute_ms = (time.monotonic() - t0) * 1000
                    ai_span.set_attribute("compute_duration_ms", compute_ms)

        except Exception as exc:
            # logger.exception("checkers_sse_error", extra={"session_id": session_id})
            span.record_exception(exc)
            span.set_status(trace.StatusCode.ERROR)
            broadcaster.emit(StatusEvent("error", code="internal_error", message="An error occurred"))
            broadcaster.close()
        finally:
            _checkers_move_queues.pop(sid, None)
            # logger.info("checkers_sse_closed", extra={"session_id": session_id})

    asyncio.create_task(process_moves())

    return StreamingResponse(
        broadcaster.stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ============================================
# REGISTRATION SNIPPET for games.py router
# ============================================
#
# from models import CheckersNewGameRequest, CheckersMoveRequest
#
# router.get("/game/checkers/resume")(checkers_resume)  -- with proper Depends
#
# Or copy the functions into games.py and decorate them properly:
#
# @router.get("/game/checkers/resume")
# async def checkers_resume_endpoint(
#     user: dict = Depends(_require_user),
#     db: AsyncSession = Depends(db_dependency),
# ):
#     ...
#
# @router.post("/game/checkers/newgame")
# async def checkers_newgame_endpoint(
#     request: CheckersNewGameRequest,
#     user: dict = Depends(_require_user),
#     db: AsyncSession = Depends(db_dependency),
# ):
#     ...
#
# @router.post("/game/checkers/move")
# async def checkers_move_endpoint(
#     request: CheckersMoveRequest,
#     user: dict = Depends(_require_user),
#     db: AsyncSession = Depends(db_dependency),
# ):
#     ...
#
# @router.get("/game/checkers/events/{session_id}")
# async def checkers_events_endpoint(
#     session_id: str,
#     user: dict = Depends(_require_user),
#     db: AsyncSession = Depends(db_dependency),
# ):
#     ...
