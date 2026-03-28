"""
Dots and Boxes endpoint patch for games.py.

To integrate, add the following to games.py:
  - Import DaBEngine, DaBStrategy from game_engine.dab_engine
  - Import DaBNewGameRequest, DaBMoveRequest from models (or define inline)
  - Add the module-level vars, helpers, and route functions below

This file is standalone and contains no side effects when imported.
"""

import asyncio
import json
import logging
import time
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Cookie, Depends, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from opentelemetry import trace
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

import persistence_service
from db import db_dependency
from game_engine.dab_engine import DaBEngine, DaBStrategy

logger = logging.getLogger(__name__)
router = APIRouter()
tracer = trace.get_tracer(__name__)

_dab_engine = DaBEngine()
_dab_strategy = DaBStrategy()
_dab_move_queues: dict[UUID, asyncio.Queue] = {}


class DaBNewGameRequest(BaseModel):
    player_starts: bool = True


class DaBMoveRequest(BaseModel):
    type: str
    row: int
    col: int


def _outcome_to_persistence(outcome: str) -> str:
    if outcome == "player_won":
        return "player_won"
    if outcome == "ai_won":
        return "ai_won"
    return "draw"


def _dab_state_payload(state: dict, move: Optional[dict], player: str) -> dict:
    terminal, outcome = _dab_engine.is_terminal(state)
    winner = None
    if terminal:
        w = _dab_engine.get_winner(state)
        winner = "player" if w == "player" else ("ai" if w == "ai" else "draw")
    return {
        "line_type": move.get("type") if move else None,
        "row": move.get("row") if move else None,
        "col": move.get("col") if move else None,
        "player": player,
        "boxes_completed": state["last_move"]["boxes_completed"] if state.get("last_move") else 0,
        "newly_claimed_boxes": state["last_move"]["newly_claimed_boxes"] if state.get("last_move") else [],
        "horizontal_lines": state["horizontal_lines"],
        "vertical_lines": state["vertical_lines"],
        "boxes": state["boxes"],
        "player_starts": state["player_starts"],
        "current_turn": state.get("current_turn") if not terminal else None,
        "player_score": state["player_score"],
        "ai_score": state["ai_score"],
        "status": "complete" if terminal else "in_progress",
        "winner": winner,
    }


_auth_service_dab = None


def _get_auth_service():
    global _auth_service_dab
    if _auth_service_dab is None:
        from auth_service import AuthService
        _auth_service_dab = AuthService()
    return _auth_service_dab


async def _require_user_dab(sessionId: Optional[str] = Cookie(None)) -> dict:
    if not sessionId:
        raise HTTPException(status_code=401, detail="Authentication required")
    user = await _get_auth_service().get_user_by_session(sessionId)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return user


@router.get("/game/dots-and-boxes/resume")
async def dab_resume(
    user: dict = Depends(_require_user_dab),
    db: AsyncSession = Depends(db_dependency),
):
    span = trace.get_current_span()
    span.set_attribute("game.id", "dots-and-boxes")

    session = await persistence_service.get_active_session_by_user_game(
        db, user["id"], "dots_and_boxes"
    )
    if not session:
        return {"session_id": None, "state": None}

    span.set_attribute("game.session_id", str(session.id))
    state = await persistence_service.get_latest_board_state(db, session.id, "dots_and_boxes")
    return {"session_id": str(session.id), "state": state}


@router.post("/game/dots-and-boxes/newgame")
async def dab_newgame(
    request: DaBNewGameRequest,
    user: dict = Depends(_require_user_dab),
    db: AsyncSession = Depends(db_dependency),
):
    span = trace.get_current_span()
    span.set_attribute("game.id", "dots-and-boxes")

    existing = await persistence_service.get_active_session_by_user_game(
        db, user["id"], "dots_and_boxes"
    )
    if existing:
        q = _dab_move_queues.pop(existing.id, None)
        if q:
            q.put_nowait({"__close__": True})
        await persistence_service.close_session(db, existing.id)

    session = await persistence_service.create_game_session(db, user["id"], "dots_and_boxes")
    span.set_attribute("game.session_id", str(session.id))

    state = _dab_engine.initial_state(request.player_starts)

    if not request.player_starts:
        ai_move, _ = _dab_strategy.generate_move(state)
        state = _dab_engine.apply_move(state, ai_move)
        await persistence_service.record_move(
            db, session.id, "dots_and_boxes", "ai", ai_move, state
        )
    else:
        await persistence_service.record_move(
            db, session.id, "dots_and_boxes", "setup", None, state
        )

    return {"session_id": str(session.id), "state": state}


@router.post("/game/dots-and-boxes/move")
async def dab_move(
    request: DaBMoveRequest,
    user: dict = Depends(_require_user_dab),
    db: AsyncSession = Depends(db_dependency),
):
    span = trace.get_current_span()
    span.set_attribute("game.id", "dots-and-boxes")

    session = await persistence_service.get_active_session_by_user_game(
        db, user["id"], "dots_and_boxes"
    )
    if not session:
        raise HTTPException(status_code=409, detail="No active session")

    span.set_attribute("game.session_id", str(session.id))

    state = await persistence_service.get_latest_board_state(db, session.id, "dots_and_boxes")
    if not state:
        raise HTTPException(status_code=409, detail="No board state found")

    move = {"type": request.type, "row": request.row, "col": request.col}
    if not _dab_engine.validate_move(state, move):
        raise HTTPException(status_code=422, detail="Invalid move")

    q = _dab_move_queues.get(session.id)
    if q:
        await q.put(move)

    return JSONResponse(status_code=202, content=None)


@router.get("/game/dots-and-boxes/events/{session_id}")
async def dab_events(
    session_id: str,
    user: dict = Depends(_require_user_dab),
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
    span.set_attribute("game.id", "dots-and-boxes")
    span.set_attribute("game.session_id", session_id)

    output_q: asyncio.Queue[Optional[str]] = asyncio.Queue()
    move_q: asyncio.Queue = asyncio.Queue()
    _dab_move_queues[sid] = move_q

    async def process_moves():
        try:
            state = await persistence_service.get_latest_board_state(db, sid, "dots_and_boxes")
            while True:
                try:
                    msg = await asyncio.wait_for(move_q.get(), timeout=31)
                except asyncio.TimeoutError:
                    output_q.put_nowait('data: {"type": "heartbeat"}\n\n')
                    continue

                if msg.get("__close__"):
                    output_q.put_nowait(None)
                    return

                move = {"type": msg["type"], "row": msg["row"], "col": msg["col"]}
                player_state = _dab_engine.apply_move(state, move)
                await persistence_service.record_move(
                    db, sid, "dots_and_boxes", "human", move, player_state
                )

                terminal, outcome = _dab_engine.is_terminal(player_state)

                payload = _dab_state_payload(player_state, move, "player")
                output_q.put_nowait(
                    f'data: {json.dumps({"type": "move", "data": payload})}\n\n'
                )

                if terminal:
                    await persistence_service.end_game_session(
                        db, sid, _outcome_to_persistence(outcome), "dots_and_boxes"
                    )
                    output_q.put_nowait(None)
                    return

                state = player_state

                if state["current_turn"] == "player":
                    continue

                output_q.put_nowait(
                    'data: {"type": "status", "message": "Thinking..."}\n\n'
                )
                await asyncio.sleep(0.5)

                while state.get("current_turn") == "ai" and state.get("game_active", True):
                    ai_move, _ = _dab_strategy.generate_move(state)
                    with tracer.start_as_current_span("game.ai.move") as ai_span:
                        ai_span.set_attribute("game.id", "dots-and-boxes")
                        ai_span.set_attribute("game.session_id", session_id)
                        t0 = time.monotonic()
                        ai_state = _dab_engine.apply_move(state, ai_move)
                        compute_ms = (time.monotonic() - t0) * 1000
                        ai_span.set_attribute("compute_duration_ms", compute_ms)

                    await persistence_service.record_move(
                        db, sid, "dots_and_boxes", "ai", ai_move, ai_state
                    )
                    terminal, outcome = _dab_engine.is_terminal(ai_state)

                    payload = _dab_state_payload(ai_state, ai_move, "ai")
                    output_q.put_nowait(
                        f'data: {json.dumps({"type": "move", "data": payload})}\n\n'
                    )

                    if terminal:
                        await persistence_service.end_game_session(
                            db, sid, _outcome_to_persistence(outcome), "dots_and_boxes"
                        )
                        output_q.put_nowait(None)
                        return

                    state = ai_state

                    if state["current_turn"] == "ai":
                        await asyncio.sleep(0.5)

        except Exception as exc:
            logger.exception("dab_sse_error", extra={"session_id": session_id})
            span.record_exception(exc)
            output_q.put_nowait(
                'data: {"type": "error", "code": "internal_error", "message": "An error occurred"}\n\n'
            )
            output_q.put_nowait(None)
        finally:
            _dab_move_queues.pop(sid, None)
            logger.info("dab_sse_closed", extra={"session_id": session_id})

    asyncio.create_task(process_moves())

    async def event_generator():
        while True:
            item = await output_q.get()
            if item is None:
                return
            yield item

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
