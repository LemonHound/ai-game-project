# Game Data Persistence Spec

**Status: needs implementation** — schema redesigned; prior code against old schema must be replaced.

## Background

The original schema had two layers: `game_sessions` (session lifecycle) and per-game `{game_type}_moves`
tables (one row per move). A previous spec revision proposed `{game_type}_games` (one row per session,
updated in place), but was never implemented — the code still uses the per-move model. This spec replaces
both the old code and the unimplemented revision with a new consolidated design agreed with the ML team.

The consolidated design merges session lifecycle and game data into a single per-game table. `game_sessions`
is eliminated. Each game table owns its session metadata directly. The `id` column on the game record is
the session identifier used by the client — no separate session concept exists.

All existing tables are dropped. There is no production data worth preserving.

Note: `user_sessions` (auth token/expiry table) is a separate concern owned by `auth.py` and is not
touched by this spec.

## Design Principles

1. **One table per game type.** Each game has its own table with identical structure. No cross-game joins
   required for any operational query.
2. **One row per game session, updated in place.** A game record is created at session start, and
   `board_state`, `move_list`, and status columns are updated on every move. No new rows are inserted after
   creation.
3. **`id` is the session identifier.** The client receives `id` from `/resume` or `/newgame` and uses it to
   subscribe to the SSE stream. There is no separate `session_id` column.
4. **`board_state` is the live state.** Overwritten on every move. Used for resume/reconstruction and
   server-side game state. Not used for ML training.
5. **`move_list` is the ML record.** An append-only array of moves in game-standard notation (see
   game-training-data spec). Used by the ML pipeline and for game reconstruction by replaying from initial
   state. Not queried during normal gameplay.
6. **No `engine_eval`, no `difficulty` in DB.** Engine eval is a runtime concern; difficulty is a
   UI-display concern. Neither belongs in the game record.
7. **DB is canonical game state.** In-memory session dicts are eliminated. Any request with a valid game
   `id` can reconstruct full game state from `board_state` alone.

## Schema

### `{game_type}_games` (one table per game)

e.g. `tic_tac_toe_games`, `chess_games`, `checkers_games`, `connect4_games`, `dots_and_boxes_games`

One row per game session. Created when the game starts, updated in place on every move.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | also serves as session identifier for SSE and resume |
| user_id | INT FK → users | non-null; unauthenticated users cannot create sessions |
| created_at | TIMESTAMPTZ | set at game start; stored as UTC |
| last_move_at | TIMESTAMPTZ | updated on every move; used for stale-session check; stored as UTC |
| board_state | JSONB | full board state after the most recent move; set to initial state on creation; overwritten on every move |
| move_list | TEXT[] | append-only array of moves in standard notation; empty on creation |
| game_ended | BOOLEAN | default false |
| game_abandoned | BOOLEAN | default false |
| is_draw | BOOLEAN | default false |
| player_won | BOOLEAN | default false |
| ai_won | BOOLEAN | default false |

**Check constraint** (per table): `(is_draw::int + player_won::int + ai_won::int) <= 1`

**Partial unique index** (per table): `UNIQUE (user_id) WHERE NOT game_ended` — enforces one active
session per user per game type. Prevents duplicate session creation under concurrent requests.

### SQLModel Definition Pattern

All game tables share the same structure via a non-table base class:

```python
class GameRecord(SQLModel):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: int
    created_at: datetime = Field(default_factory=_utcnow)
    last_move_at: datetime = Field(default_factory=_utcnow)
    board_state: Any = Field(sa_column=Column(JSONB, nullable=False))
    move_list: list[str] = Field(sa_column=Column(ARRAY(String), nullable=False, server_default="{}"))
    game_ended: bool = Field(default=False)
    game_abandoned: bool = Field(default=False)
    is_draw: bool = Field(default=False)
    player_won: bool = Field(default=False)
    ai_won: bool = Field(default=False)

class ChessGame(GameRecord, table=True):
    __tablename__ = "chess_games"
    __table_args__ = (
        CheckConstraint("(is_draw::int + player_won::int + ai_won::int) <= 1", ...),
        Index("uq_active_chess_per_user", "user_id", unique=True, postgresql_where=text("NOT game_ended")),
    )
```

Each game type gets its own concrete class with its own `__tablename__` and table args. No shared FK
relationships between game tables.

`GAME_TYPE_TO_MODEL` dict maps game type strings to their model class, replacing `GAME_TYPE_TO_MOVE_MODEL`.

## Session Lifecycle

**Authentication requirement:** all game sessions require an authenticated user. Unauthenticated requests
to start or resume a game are rejected with 401; the frontend surfaces a login prompt modal.

**Resume:** `get_active_game(user_id, game_type)` — returns the existing in-progress game record if one
exists. If the existing record's `last_move_at` is older than 30 days, it is marked
`game_ended=true, game_abandoned=true` and `None` is returned. Called by `GET /{game}/resume`.

**New game:** the router calls `close_game(id, game_type)` on any existing active record, then calls
`create_game(user_id, game_type, initial_board_state)` to create a fresh record. If `player_starts=false`,
the router processes the AI's first move via the game engine and calls `record_move` before returning the
response. Called by `POST /{game}/newgame`.

**On every valid move:** `record_move(game_id, game_type, move_notation, board_state_after)` — appends
`move_notation` to `move_list`, sets `board_state` to `board_state_after`, and updates `last_move_at`. No
new rows are inserted.

**Session end:** `end_game(game_id, game_type, outcome)` — sets `game_ended=true` and the appropriate
outcome boolean. Called on win, loss, draw, or when a new game is started (which closes any prior record
for that game type as `game_ended=true, game_abandoned=true`).

**Resume prompt:** checked lazily on two triggers:
- User logs in
- User navigates to a game page

If the user has more than one in-progress game across game types, the prompt surfaces all of them. No
scheduled cleanup; sessions are resolved as users interact with the site.

**One in-progress session per user per game type.** The partial unique index enforces this at the DB level.

## Persistence Abstraction Layer

`src/backend/persistence_service.py` — async module called by game engine routers. Game engines do not
interact with the DB directly.

```python
async def get_active_game(
    session: AsyncSession, user_id: int, game_type: str
) -> GameRecord | None
"""
Returns the in-progress game record for user_id + game_type, or None if no active game exists.
Auto-marks stale records (last_move_at older than 30 days) as abandoned and returns None.
"""

async def create_game(
    session: AsyncSession, user_id: int, game_type: str, initial_board_state: dict
) -> GameRecord
"""
Creates a new game record with move_list=[] and board_state=initial_board_state.
Caller is responsible for closing any prior active game first.
"""

async def record_move(
    session: AsyncSession, game_id: UUID, game_type: str,
    move_notation: str, board_state_after: dict
) -> None
"""
Appends move_notation to move_list, sets board_state to board_state_after, updates last_move_at.
move_notation must be in the standard notation for the game type (see game-training-data spec).
"""

async def end_game(
    session: AsyncSession, game_id: UUID, game_type: str, outcome: str
) -> None
"""
Sets game_ended=true and the appropriate outcome boolean.
outcome: "player_won" | "ai_won" | "draw" | "abandoned"
"""

async def get_game(
    session: AsyncSession, game_id: UUID, game_type: str
) -> GameRecord | None
"""Returns the game record by id, or None if not found."""

async def get_all_active_games(
    session: AsyncSession, user_id: int
) -> list[tuple[str, GameRecord]]
"""
Returns all in-progress records across all game types for user_id,
as (game_type, record) pairs. Used for the cross-game resume prompt.
"""

async def close_game(
    session: AsyncSession, game_id: UUID, game_type: str
) -> None
"""Marks the record as game_ended=true, game_abandoned=true."""

async def cleanup_stale_games(
    session: AsyncSession, game_type: str, timeout_hours: int
) -> int
"""
Bulk-marks abandoned any records where last_move_at < now() - timeout_hours.
Returns the count of records updated. Called by the Cloud Scheduler cleanup endpoint.
"""
```

## State Recovery Endpoint

```
GET /api/game/{game_type}/session/{id}
```

Returns `board_state` from the game record. Used for both catastrophic client rebuilds (React error
boundary) and normal game resume. The `id` is the UUID returned by `/resume` or `/newgame`.

## Schema Management: SQLModel + Alembic

**Stack:** SQLModel (SQLAlchemy 2.0) + `asyncpg` driver + Alembic migrations.

- Alembic autogenerates migrations from model diffs
- All DB calls are async (SQLAlchemy 2.0 `AsyncSession`)
- `opentelemetry-instrumentation-sqlalchemy` covers all DB instrumentation

Workflow for adding a column to a game table:
1. Add the field to the `GameRecord` base class (if shared) or the specific game model
2. `alembic revision --autogenerate -m "description"`
3. `alembic upgrade head`

`scripts/setup-database.sql` remains retired. `alembic upgrade head` is the canonical DB init command,
applied in CI before tests and in Cloud Build deploy step before Cloud Run service update.

## OTel Instrumentation

Persistence service functions open child spans under the game router's root span:
- `persistence.create_game` — attributes: `game.type`, `user.id`
- `persistence.record_move` — attributes: `game.id`, `game.type`
- `persistence.end_game` — attributes: `game.id`, `game.type`, `game.outcome`

Metrics:
- `game.sessions.started` counter (incremented by `create_game`, attribute: `game.type`)
- `game.sessions.completed` counter (incremented by `end_game`, attributes: `game.type`, `game.outcome`)

## Migration Plan

1. Drop all existing tables: `game_sessions`, `tic_tac_toe_moves`, `chess_moves`, `checkers_moves`,
   `connect4_moves`, `dots_and_boxes_moves`, and any legacy tables (`game_states`, `ai_training_data`,
   `tic_tac_toe_states`, `checkers_states`, `game_difficulty`)
2. Define `GameRecord` base class and per-game concrete models in `db_models.py`
3. `alembic revision --autogenerate -m "consolidated game records"` — generates migration creating all
   `{game_type}_games` tables with constraints and indexes
4. `alembic upgrade head`
5. Replace all `persistence_service.py` functions with the new signatures above
6. Update all game routers to use the new function signatures (no `difficulty`, no `engine_eval`, new
   `move_notation` parameter on `record_move`)
7. Update `GAME_TYPE_TO_MODEL` dict in `db_models.py`
8. Remove stale `GAME_TYPE_TO_MOVE_MODEL` reference
9. **Rename `session_id` → `game_id` throughout `games.py` and `persistence_service.py`:**
   - All function parameters named `session_id` → `game_id`
   - All `span.set_attribute("game.session_id", ...)` → `span.set_attribute("game.id", ...)`
   - All `extra={"session_id": ...}` log dicts → `extra={"game_id": ...}`
   - All JSON response keys `"session_id"` → `"id"` (e.g. `{"session_id": str(...)}` → `{"id": str(...)}`)
   - All SSE endpoint path params `/events/{session_id}` → `/events/{id}`
   - All `get_game_session_state`, `end_game_session`, `close_session` calls → new function names
10. **Update frontend API types and page components** — every game has the same pattern:
    - `src/frontend/src/api/{game}.ts`: response types `session_id: string` → `id: string`
    - `src/frontend/src/pages/games/{Game}Page.tsx`: destructure `{ id, state }` from resume/newgame;
      rename local `session_id` vars to `gameId`; update `subscribeSSE(gameId)` and `setSessionId(gameId)`
    - Affected files: `ttt.ts`, `connect4.ts`, `chess.ts`, `checkers.ts`, `dab.ts` and their
      corresponding `*Page.tsx` files

## Test Cases

| Tier | Name | What it checks |
|------|------|----------------|
| Unit | `test_create_game_sets_initial_state` | `create_game()` sets `board_state` to provided initial state, `move_list=[]` |
| Unit | `test_get_active_game_returns_existing` | Returns in-progress record for user + game type |
| Unit | `test_get_active_game_returns_none_when_absent` | Returns None when no active game exists |
| Unit | `test_get_active_game_expires_stale` | Marks record abandoned and returns None when `last_move_at` > 30 days |
| Unit | `test_record_move_appends_notation` | `record_move()` appends to `move_list`, updates `board_state`, updates `last_move_at` |
| Unit | `test_record_move_no_new_row` | `record_move()` does not insert a new row; record count stays at 1 after multiple moves |
| Unit | `test_end_game_sets_flags` | `end_game()` sets `game_ended` and correct outcome boolean |
| Unit | `test_outcome_check_constraint` | DB rejects row with multiple outcome booleans true |
| Unit | `test_partial_unique_index` | Creating a second active record for same user + game type raises integrity error |
| Unit | `test_close_game_marks_abandoned` | `close_game()` sets `game_ended=true, game_abandoned=true` |
| API integration | `move_updates_board_state` | Making a move via game endpoint overwrites `board_state`; `move_list` length increases |
| API integration | `new_game_closes_prior_record` | Starting a new game marks prior active record as ended + abandoned before creating new |
| API integration | `resume_returns_active_record` | Resume query returns in-progress record under 30 days old |
| API integration | `resume_expires_stale_record` | Resume query marks record abandoned, returns null session |
| API integration | `session_state_endpoint_returns_board` | `GET /api/game/{type}/session/{id}` returns `board_state` |
| API integration | `alembic_migration_clean` | `alembic upgrade head` applies cleanly on fresh DB; `alembic downgrade -1` reverses cleanly |
| Manual | Cloud SQL console | After first production deploy, verify `{game_type}_games` tables exist with correct schema |
| Manual | Cloud SQL console | Verify old tables (`game_sessions`, `chess_moves`, etc.) are absent after migration |
