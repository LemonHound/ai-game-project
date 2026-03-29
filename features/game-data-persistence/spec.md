# Game Data Persistence Spec

**Status: needs revision** — schema updated: `{game_type}_moves` replaced by `{game_type}_games` (one row per session, updated in place); `game_sessions.difficulty` column added (FLOAT, see `features/game-training-data/spec.md`). Re-implementation required.

## Background

Game sessions are currently stored in-memory within each game module (e.g., `tic_tac_toe_game.sessions`).
Some DB infrastructure already exists: per-game tables (`tic_tac_toe_games`, `checkers_games`), a generic
`game_states` JSONB table, and an `ai_training_data` table. This schema grew organically, only 2 of 5 games
write to it, and it is not designed for ML training pipelines or long-term maintainability. The in-memory
session model is also fundamentally incompatible with session recovery and server-authoritative game state.

All existing tables are dropped and replaced. There is no production data worth preserving — all stored
records are test data from development.

This spec covers the full scope: schema redesign via SQLModel + Alembic, the persistence abstraction
layer, and the data capture contract required for stats, OTel instrumentation, and ML.

Note: `user_sessions` (auth token/expiry table) is a separate concern owned by `auth.py` and is not
touched by this spec.

## Design Principles

1. **Write on every valid move.** Each player move and each AI response move is written to the DB
   immediately after validation. The DB is the canonical game state — not in-memory session storage.
2. **DB-backed sessions, not in-memory.** In-memory session dicts are replaced by DB lookups. Any request
   carrying a valid session_id can reconstruct full game state from the DB alone.
3. **Server is source of truth.** Clients always accept server state. On reconnect or desync, the client
   re-fetches and overwrites local state.
4. **Every valid board position is independently valuable.** ML models need (position → move → outcome)
   tuples. All positions are training candidates regardless of whether the game completed.
5. **Schema is explicitly extensible.** New columns will be added to game tables as ML model design
   matures. Existing rows will have NULL in new columns; application logic gates on NULL where needed.
   Adding a column requires only a model change + `alembic revision --autogenerate` + `alembic upgrade head`.

**Exception: real-time games (Pong and future equivalents).** Continuous-state games do not have discrete
moves suitable for this model. Their game state is lost on disconnect; sessions reset. Data capture for
real-time games requires a separate strategy defined in the websocket spec.

## Schema Management: SQLModel + Alembic

**Stack:** SQLModel (SQLAlchemy 2.0 + Pydantic v2) + `asyncpg` driver + Alembic migrations.

SQLModel combines the ORM model and the API/Pydantic schema into a single Python class. This means:
- One class definition serves as both the DB table and the response model — no conversion layer
- Alembic autogenerates migrations from model diffs
- All DB calls are async (SQLAlchemy 2.0 `AsyncSession`) — no event loop blocking
- `opentelemetry-instrumentation-sqlalchemy` covers all DB instrumentation; `database.py` and the
  manual psycopg2 pool are retired as part of this feature's implementation

Workflow for adding a column:
1. Add the field to the SQLModel class
2. `alembic revision --autogenerate -m "description"`
3. `alembic upgrade head`

No direct DB access required. All migrations are versioned and tracked in `scripts/migrations/`.
`scripts/setup-database.sql` is retired; `alembic upgrade head` is the canonical DB init command.

## Schema

### `game_sessions`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK → users | non-null; unauthenticated users cannot create sessions |
| game_type | VARCHAR | `tic_tac_toe`, `chess`, `checkers`, `connect4`, `dots_and_boxes` |
| difficulty | FLOAT | AI training quality at session creation time; set from `game_difficulty` table; `[0.0, 1.0]` |
| game_ended | BOOLEAN | default false; partial index on `(user_id, game_type) WHERE NOT game_ended` |
| game_abandoned | BOOLEAN | default false |
| is_draw | BOOLEAN | default false |
| player_won | BOOLEAN | default false |
| ai_won | BOOLEAN | default false |
| started_at | TIMESTAMPTZ | stored as UTC |
| last_move_at | TIMESTAMPTZ | updated on every move; used for 30-day cutoff check; stored as UTC |

Check constraint: at most one of `is_draw`, `player_won`, `ai_won` may be true simultaneously.

Partial unique index: `UNIQUE (user_id, game_type) WHERE NOT game_ended` — enforces one active session
per user per game type and prevents duplicate session creation under concurrent requests.

**Why booleans over an enum:** partial indexes on `WHERE NOT game_ended` are the optimal access pattern
for resume queries against a large table. The check constraint enforces valid state at the DB level.

### `{game_type}_games` (one table per game)

e.g. `tic_tac_toe_games`, `chess_games`, `checkers_games`, `connect4_games`, `dots_and_boxes_games`

One row per game session. Created when the game starts, updated in place on every move.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| session_id | UUID FK → game_sessions | unique; one game record per session |
| current_board_state | JSONB | full board state after the most recent move; updated on every move |
| move_history | JSONB | append-only array of move entries (see below); updated on every move |
| move_count | INT | total moves made so far; incremented on every move |
| created_at | TIMESTAMPTZ | set at game start |
| updated_at | TIMESTAMPTZ | updated on every move |

`session_id` has a unique constraint — there is exactly one game record per session.

**`move_history` entry format:**
```json
{"move_number": 1, "player": "human", "move": {...}, "engine_eval": 0.12}
```
Each entry is appended to the array on the move that produced it. `engine_eval` is nullable;
`player` is `"human"` or `"ai"`. The full board state is not stored per move — `current_board_state`
holds the latest state, which is sufficient for session recovery. Full game reconstruction can be
achieved by replaying `move_history` entries against the game engine.

### `engine_eval` normalization

All engine eval scores are normalized to [-1, 1] via `tanh(raw_eval / k)` before storage, where `k` is
a per-game scaling constant (e.g. centipawn scale for chess). Convention:
- `+1` = forced win for player (e.g. checkmate in N by player)
- `-1` = forced win for AI
- `0` = equal position / draw
- Values between represent continuous advantage

This normalization is applied by the game engine before calling `record_move`. The raw eval is not
stored. tanh ensures terminal positions map cleanly to ±1 and the range is compatible with standard
neural network input expectations.

`engine_eval` is stored for both human and AI move entries. For the player's move, one additional
evaluation call runs alongside the AI response computation — the position evaluation is a byproduct of
the engine's normal search and adds negligible overhead. For advanced games (chess, checkers) where
open-source engines are used, eval scores are extracted from the engine's reported evaluation at search
completion.

## Session Lifecycle

**Authentication requirement:** all game sessions require an authenticated user. Unauthenticated requests
to start a game are rejected with 401; the frontend surfaces a login prompt modal.

**Session start:** `get_or_create_game_session(user_id, game_type)` — returns the existing in-progress
session if one exists, otherwise creates a new one. If the existing session's `last_move_at` is older
than 30 days, it is marked `game_ended=true, game_abandoned=true` and a new session is created.

If a user selects a game type they already have an in-progress session for, the frontend first offers
the resume prompt (see error-handling spec). If the user chooses to start fresh, the old session is
ended via `end_game_session` before the new one is created.

**On every valid move:** `record_move(session_id, player, move, board_state_after, engine_eval)` —
appends to `move_history`, updates `current_board_state` and `move_count` on the game record, and
updates `last_move_at` on the session. No new rows are inserted after game creation.

**Session end:** `end_game_session(session_id, outcome)` — sets `game_ended=true` and the appropriate
outcome boolean. Called on win, loss, draw, or when the user starts a new game (which ends any prior
in-progress session for that game type as `game_ended=true, game_abandoned=true`).

**Resume prompt:** checked lazily on two triggers:
- User logs in
- User navigates to a game page

If the user has more than one in-progress game across game types, the prompt surfaces all of them
("looks like you have some games still in progress..."). No scheduled cleanup; sessions are resolved
as users interact with the site.

**One in-progress session per user per game type.** Multiple game types may be in-progress simultaneously.
The partial unique index on `game_sessions` enforces this at the DB level.

## Persistence Abstraction Layer

`src/backend/persistence_service.py` — async module of functions called by game engine routers.
Game engines do not interact with the DB directly.

```python
async def get_or_create_game_session(user_id, game_type) -> GameSession
async def record_move(session_id, player, move, board_state_after, engine_eval) -> None
async def end_game_session(session_id, outcome) -> None
async def get_game_session_state(session_id) -> GameSession | None
async def get_active_game_sessions(user_id) -> list[GameSession]
```

`get_or_create_game_session` creates both the `game_sessions` row and the corresponding
`{game_type}_games` row when starting a new session. `GameSession` is a SQLModel class serving as both
ORM model and Pydantic response schema.

The abstraction layer is responsible for: async DB session management, transaction handling, OTel child
spans for DB write operations (per observability spec), and error propagation.

When the WebSocket feature is implemented, this layer hooks into WebSocket message handling in addition
to REST handlers — the same `record_move` call applies.

## State Recovery Endpoint

```
GET /api/games/{game_type}/session/{session_id}
```

Returns `current_board_state` from the `{game_type}_games` row for the session. Used for both
catastrophic client rebuilds (React error boundary) and normal game resume. See error-handling spec
for client-side usage.

## Data Lifecycle and ML Pipeline

Cloud SQL is the live operational store. When ML model training is ready to begin, completed game data
will be **migrated out** of Cloud SQL into BigQuery rather than duplicated — this keeps the operational
DB lean and routes analytical queries to a purpose-built store. The Alembic schema and SQLModel
definitions will inform the BigQuery table schema at that time.

Direct analytical queries against the production Cloud SQL instance should be avoided.

## Migration Plan

1. `alembic revision --autogenerate -m "initial schema"` — generates migration that drops existing tables
   (`tic_tac_toe_games`, `checkers_games`, `game_states`, `ai_training_data`, `tic_tac_toe_states`,
   `checkers_states`) and creates `game_sessions` + all `{game_type}_games` tables
2. `database.py` (manual psycopg2 pool) is retired; SQLAlchemy async engine and `AsyncSession` replace it
   across **all** backend files — `auth.py` and `games.py` use the psycopg2 pool directly and must be
   migrated to async SQLAlchemy as part of this feature, not left as a follow-up
3. `alembic upgrade head` applied in CI before tests, and in Cloud Build deploy step before Cloud Run
   service update
4. `scripts/setup-database.sql` is retired

## Known Requirements

- All DB calls are async — no synchronous blocking of the FastAPI event loop
- Must integrate with OTel (child spans for DB write operations, per observability spec)
- Data captured per move must be sufficient to reconstruct any game by replaying `move_history` entries
- Schema changes require only a model edit + two Alembic commands — no direct DB access needed
- This feature is a hard prerequisite for the error-handling session recovery model
- `user_sessions` auth table is unaffected by this migration

## Test Cases

| Tier | Name | What it checks |
|------|------|----------------|
| Unit | `unit/test_persistence_service.py::test_get_or_create_game_session_creates_new` | Creates session when none exists for user + game type |
| Unit | `unit/test_persistence_service.py::test_get_or_create_game_session_returns_existing` | Returns existing in-progress session |
| Unit | `unit/test_persistence_service.py::test_get_or_create_game_session_expires_stale` | Marks session abandoned and creates new when last_move_at > 30 days |
| Unit | `unit/test_persistence_service.py::test_record_move_appends_to_history` | `record_move()` appends entry to `move_history`, increments `move_count`, updates `current_board_state` and `last_move_at` |
| Unit | `unit/test_persistence_service.py::test_record_move_no_new_row` | `record_move()` does not insert a new row; game record count stays at 1 after multiple moves |
| Unit | `unit/test_persistence_service.py::test_end_game_session_sets_flags` | `end_game_session()` sets `game_ended` and correct outcome boolean |
| Unit | `unit/test_persistence_service.py::test_outcome_check_constraint` | DB rejects row with multiple outcome booleans true |
| Unit | `unit/test_persistence_service.py::test_duplicate_session_race_condition` | Concurrent session creation for same user+game type results in exactly one session |
| Unit | `unit/test_persistence_service.py::test_get_or_create_creates_game_record` | New session creation also creates the `{game_type}_games` row |
| API integration | `api/persistence.spec.ts::move_updates_game_record` | Making a move via game endpoint updates the single game record; `move_history` length increases |
| API integration | `api/persistence.spec.ts::new_game_ends_prior_session` | Starting a new game marks prior in-progress session as ended + abandoned |
| API integration | `api/persistence.spec.ts::resume_returns_active_session` | Resume query returns in-progress session under 30 days old |
| API integration | `api/persistence.spec.ts::resume_expires_stale_session` | Resume query marks session abandoned and returns no active session when > 30 days old |
| API integration | `api/persistence.spec.ts::engine_eval_captured_in_history` | `move_history` entries contain `engine_eval` in [-1, 1] range for both human and AI moves |
| API integration | `api/persistence.spec.ts::session_state_endpoint_returns_board` | `GET /api/games/{game_type}/session/{id}` returns `current_board_state` |
| API integration | `api/persistence.spec.ts::alembic_migration_clean` | `alembic upgrade head` applies cleanly on fresh DB; `alembic downgrade -1` reverses cleanly |
| Manual | Cloud SQL console | After first production deploy, verify `game_sessions` and `{game_type}_games` tables exist with correct schema |
| Manual | Cloud SQL console | Verify old tables (`tic_tac_toe_games`, `checkers_games`, `game_states`) are absent after migration |
