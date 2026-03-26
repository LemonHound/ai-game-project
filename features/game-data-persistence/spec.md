# Game Data Persistence Spec

## Background

Game sessions are currently stored in-memory within each game module (e.g., `tic_tac_toe_game.sessions`).
Some DB infrastructure already exists: per-game tables (`tic_tac_toe_games`, `checkers_games`), a generic
`game_states` JSONB table, and an `ai_training_data` table. However, this schema grew organically and lacks
a shared abstraction — some games write directly to DB, others do not, and the structure is not designed for
ML training pipelines or long-term maintainability. The in-memory session model is also fundamentally
incompatible with session recovery and server-authoritative game state (see Design Principles below).

This spec covers the full scope: schema redesign, migration from existing tables, the persistence abstraction
layer, and the data capture contract required for stats, analytics, and ML.

## Design Principles

These are non-negotiable constraints that flow from the ML training data requirement and the error handling
model (see error-handling spec):

1. **Write on every valid move.** Each player move and each AI response move is written to the DB
   immediately after validation. The DB is the canonical game state — not in-memory session storage.
2. **DB-backed sessions, not in-memory.** In-memory session dicts are replaced by DB lookups. Any request
   carrying a valid session_id can reconstruct full game state from the DB alone.
3. **Server is source of truth.** Clients always accept server state. On reconnect or desync, the client
   re-fetches and overwrites local state.
4. **Every valid board position is independently valuable.** ML models for these games need (position →
   move → outcome) tuples. How a position was reached, whether the game completed, or how long ago it was
   played is irrelevant — all positions are training candidates.
5. **Games are resumable indefinitely.** Since state lives in the DB, a user can reconnect days, weeks, or
   months later and continue a game in progress. A session cutoff policy (see Open Questions) determines
   when a game is marked abandoned rather than in-progress.

**Exception: real-time games (Pong and future equivalents).** Continuous-state games do not have discrete
moves suitable for this model. Their game state is lost on disconnect; sessions reset. Data capture for
real-time games requires a separate strategy defined in the websocket spec.

## Scope

1. **DB schema design** — audit existing tables, define a future-proof schema that accommodates per-game
   state shapes, full move logs, and ML training data requirements
2. **Schema maintainability** — versioned SQL migrations so the schema can evolve without data loss
3. **Persistence abstraction layer** — a shared backend service all game engines call; game engines do not
   touch the DB directly
4. **Data capture contract** — define exactly what is captured at session start, each move (player + AI),
   and session end to satisfy stats, OTel instrumentation, and ML pipelines

## Proposed Approach (to be confirmed in planning)

- Audit existing tables — identify what to keep, migrate, or replace
- Adopt versioned SQL migration files (`scripts/migrations/001_*.sql`) rather than a monolithic setup script
- Replace in-memory session dicts with a `get_or_create_session(session_id)` DB lookup in each game engine
- A shared `persistence_service.py`: `record_move(session_id, player, move, board_state_after, is_ai)`
  called immediately after each validated move
- Per-game tables with typed columns for queryability; a JSONB `move_log` column captures full move history
  in a format reusable for ML pipelines
- The abstraction layer handles: connection pooling, transaction handling, error handling, OTel spans
- When the WebSocket feature is implemented, this layer hooks into WebSocket message handling in addition
  to REST handlers

## Known Requirements

- Must not block game responses — DB writes are synchronous within the request but must not add perceptible
  latency (connection pooling already in place via psycopg2 pool)
- Must accommodate different per-game state shapes without coupling game logic to persistence logic
- Must integrate with OTel (spans for DB write operations, per observability spec)
- Data captured per move must be sufficient to:
  - Reconstruct or replay any game from its move log
  - Compute win/loss/draw/streak stats per user per game
  - Produce (position, move, outcome) tuples for ML model training and evaluation
- Must work with both REST and WebSocket game traffic (see websocket spec)
- Schema changes must be applied via versioned migrations, not manual edits to setup-database.sql
- This feature is a hard prerequisite for the error-handling session recovery model

## Open Questions

### Schema Design
- Audit finding: which existing tables are worth keeping vs. replacing? (`game_states` JSONB is generic but
  untyped; per-game tables have typed columns but no shared structure)
- One shared `game_sessions` table with per-game typed tables for moves, or fully per-game schemas?
- What is the canonical move log format? (Structured JSONB per move vs. encoded string like current
  `move_sequence TEXT`)
- What ML-specific fields are needed beyond game outcome + move log? (time-per-move, difficulty, board
  evaluation score if available from the engine?)

### Session Lifecycle
- What is the cutoff for marking a game abandoned vs. in-progress? (30 days? 1 year? User-configurable?)
- Can a user have multiple in-progress games simultaneously across different game types?
- What triggers the "continue your last game?" prompt — login, navigating to a game page, or both?

### Migration Strategy
- How are existing in-memory sessions handled at cutover — dropped or flushed to DB first?
- How are existing `tic_tac_toe_games` and `checkers_games` records migrated if schema changes?
- Is Alembic appropriate here, or hand-written versioned SQL files sufficient?

### Architecture
- Async vs. synchronous writes? Given the write-on-every-move requirement, this tradeoff needs evaluation.
- Python class, module of functions, or FastAPI background task dependency?

## Test Cases

_To be defined during planning session._
