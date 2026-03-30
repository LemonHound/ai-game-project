# Documentation

**Status: draft**

## Background

As external collaborators (starting with the ML/AI engineer) begin integrating with this codebase, the lack
of inline documentation creates friction. This spec defines a consistent documentation standard across the
Python backend — covering DB models, the persistence layer, game engine abstractions, and API endpoints —
and a set of change guides for common development operations.

The documentation strategy has two parts:

1. **Inline docstrings** on all public functions, classes, and endpoints that external collaborators
   or future contributors would need to understand without reading the implementation.
2. **Change guides** that describe the steps for common modifications (adding a column, adding a new game,
   adding an endpoint) so that contributors do not need to reverse-engineer the architecture.

Frontend (TypeScript) documentation is out of scope for v1. Brian's AI integration guide is the primary
near-term consumer of this work.

## Docstring Style

Use **Google-style docstrings** for all Python. This is consistent with the existing codebase conventions
and is rendered correctly by most Python tooling.

```python
def record_move(
    session: AsyncSession, game_id: UUID, game_type: str,
    move_notation: str, board_state_after: dict
) -> None:
    """Appends a move to the game record and updates the live board state.

    Called after every validated player or AI move. Updates move_list (append),
    board_state (overwrite), and last_move_at on the game record. Does not insert
    a new row.

    Args:
        session: Active SQLAlchemy AsyncSession.
        game_id: UUID of the game record (same as session identifier).
        game_type: One of "chess", "tic_tac_toe", "checkers", "connect4", "dots_and_boxes".
        move_notation: Move in the standard notation for this game type (see game-training-data spec).
            Chess: UCI string (e.g. "e2e4"). TTT: "r{row}c{col}". Connect4: "c{col}".
            Checkers: algebraic from+to (e.g. "b6d4"). Dots & Boxes: "h{r}{c}" or "v{r}{c}".
        board_state_after: Full board state dict after the move is applied. This overwrites the
            stored board_state on the game record.

    Raises:
        KeyError: If game_type is not in GAME_TYPE_TO_MODEL.
        SQLAlchemyError: Propagated from the async session on DB failure.
    """
```

Rules:
- **Always document**: persistence service functions, game engine abstract methods and their
  implementations, API endpoint functions, and any function called by external collaborators.
- **Skip**: private helpers (prefixed `_`), trivial one-liners where the signature is self-documenting,
  test functions.
- **Args section**: include type, name, and a one-sentence description for each parameter. For `session`
  (AsyncSession), a single line is sufficient.
- **Returns section**: include if the return type or its contents are non-obvious. Omit for `-> None`.
- **Raises section**: include only exceptions that callers are expected to handle or that indicate misuse.
  Do not document internal SQLAlchemy exceptions unless they propagate to the caller.
- **Do not restate the type annotation** in the docstring body — the type is already in the signature.

## Scope: What Gets Docstrings

### `persistence_service.py`

All public functions. These are the primary integration point for game routers and will be Brian's first
point of contact when wiring up the AI.

Priority functions for the AI integration guide:
- `get_active_game` — how to check for/resume an existing session
- `create_game` — how to start a new session (requires initial board state from the engine)
- `record_move` — what to call after every move (player or AI); notation format is critical
- `end_game` — when and how to close a session; valid outcome strings

### `game_engine/base.py`

All abstract base class methods. Brian's AI will call `GameEngine` and `AIStrategy` — the docstrings
here are effectively an API contract.

Priority:
- `GameEngine.validate_move` — what constitutes a valid move dict; returns bool
- `GameEngine.apply_move` — what state fields are mutated; returns new state (does not mutate in place)
- `GameEngine.initial_state` — what the state dict contains; `player_starts` parameter
- `GameEngine.get_legal_moves` — return format (list of move dicts); used by the AI fallback path
- `AIStrategy.generate_move` — return contract: `(move_dict, Optional[float])` where float is ignored;
  move may be invalid (MoveProcessor handles retry)

### `game_engine/chess_engine.py`

`ChessEngine` and `ChessAIStrategy` implementations. Document the chess-specific state shape (board array
format, field names) and which fields Brian's AI should read vs. ignore.

### API Endpoints (game routers)

Each endpoint function should have a one-line summary and a note on auth requirement, request shape, and
response codes. FastAPI auto-generates OpenAPI docs from type annotations, so docstrings here complement
rather than duplicate that output.

## Change Guides

These are documented in-spec for reference. They will be transcribed into a `CONTRIBUTING.md` or similar
file in a later pass (out of scope for v1 — the spec itself serves as the reference until then).

### Adding a Column to a Game Table

1. Add the field to `GameRecord` in `db_models.py` (if it should apply to all games) or to the specific
   game model class (if game-specific).
2. Add a default value — new columns on existing rows will be `NULL` unless a server default is specified.
3. Run: `alembic revision --autogenerate -m "add {column_name} to {table}"`
4. Review the generated migration in `scripts/migrations/versions/`. Verify the `upgrade()` and
   `downgrade()` functions are correct.
5. Run: `alembic upgrade head`
6. Update any affected persistence service functions and game router handlers.

### Adding a New Game Type

1. Implement `{game}_engine.py` in `src/backend/game_engine/`, subclassing `GameEngine` and `AIStrategy`.
2. Implement game logic in `src/backend/game_logic/{game}.py` if not already present.
3. Add a `{Game}Game(GameRecord, table=True)` model in `db_models.py` with the appropriate `__tablename__`,
   check constraint, and partial unique index.
4. Add the new type to `GAME_TYPE_TO_MODEL` in `db_models.py`.
5. Add a game router in `src/backend/` following the chess/TTT pattern (resume, newgame, move, events,
   legal-moves endpoints).
6. Register the router in `app.py`.
7. Add the move notation format for the new game type to the game-training-data spec.
8. Run: `alembic revision --autogenerate -m "add {game}_games table"` and apply.
9. Add the game entry to the `games` table (static reference data) via a migration seed.

### Adding a New API Endpoint

1. Add the route function to the appropriate game router file.
2. Define request and response models in `models.py` (Pydantic `BaseModel` classes) if the endpoint has
   a non-trivial request/response body.
3. Add authentication dependency (`get_current_user`) to the route signature.
4. Add OTel span via `with tracer.start_as_current_span(...)` for non-trivial handlers.
5. Add test cases (API integration tier in the game's Playwright spec file).

### Adding a DB Migration (manual, without model change)

For seed data or index changes that Alembic cannot autogenerate:
1. Run: `alembic revision -m "description"` (no `--autogenerate`)
2. Write the `upgrade()` and `downgrade()` SQL manually using `op.execute()`.
3. Apply with `alembic upgrade head`.

## AI Integration Guide (Brian)

This section is a primer for the ML engineer integrating an AI model with the chess backend. A full,
dedicated guide will be written as a follow-up once the chess spec implementation is complete.

### Hooking Into the Game Loop

The chess game router processes moves via two paths:

**Player move path** (`POST /api/game/chess/move`):
1. Validates the player's move via `ChessEngine.validate_move(state, move)`
2. Applies it via `ChessEngine.apply_move(state, move)` → new state
3. Persists via `record_move(game_id, "chess", uci_notation, new_state)`
4. Checks terminal condition via `ChessEngine.is_terminal(new_state)`
5. Calls `generate_move` on the `AIStrategy` instance for the AI's response turn

**AI response path** (inside the same request, after player move):
1. `ChessAIStrategy.generate_move(state)` is called with the current state (after player's move)
2. Returns `(move_dict, Optional[float])` — the float is the engine eval, currently unused
3. `MoveProcessor.process_ai_turn` retries up to 5 times if the move is invalid; falls back to a random
   legal move
4. The AI move is applied, persisted, and broadcast over SSE

**To replace or extend `ChessAIStrategy`:**
- Subclass `AIStrategy` from `game_engine/base.py`
- Implement `generate_move(state: dict) -> tuple[dict, Optional[float]]`
- `state` is the full game state dict (see GameState Shape in the chess spec)
- Return a move dict: `{"fromRow": int, "fromCol": int, "toRow": int, "toCol": int, "promotionPiece": str | None}`
- The move does not need to be guaranteed valid — `MoveProcessor` handles retry and fallback
- Wire the new strategy into the chess router by replacing the `ChessAIStrategy()` instantiation

### Reading Board State

The `board_state` stored in `chess_games` is the same dict that `ChessEngine.apply_move` produces. Key
fields for AI consumption:
- `board`: 8×8 array, row 0 = black back rank, row 7 = white back rank. Uppercase = white pieces, lowercase
  = black. `null` = empty.
- `current_player`: `"white"` | `"black"` — whose turn it is
- `player_color`: `"white"` | `"black"` — which color the human player is
- `castling_rights`, `en_passant_target`, `king_positions`: standard chess state fields

### Reading Move History

The `move_list` column on `chess_games` contains UCI strings in move order. White always moves first.
This array can be fed directly to any UCI-compatible chess engine or used to replay the game.

## Test Cases

| Tier | Name | What it checks |
|------|------|----------------|
| Manual | Docstring coverage review | All public persistence_service functions have Google-style docstrings with Args/Raises sections |
| Manual | Base ABC docstring review | All abstract methods in `game_engine/base.py` have docstrings describing the contract |
| Manual | Change guide walkthrough | Following "adding a column" guide produces a working Alembic migration on a local DB |
