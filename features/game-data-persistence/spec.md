# Game Data Persistence Spec

## Background

Currently game sessions are stored in-memory within each game module (e.g., `tic_tac_toe_game.sessions`). There
is no persistent game history, move log, or outcome record. The `game_sessions` table exists in the DB schema
but is unused. Each game has its own state shape and logic; this spec defines a shared abstraction layer that
standardizes how game data is written to the database across all games.

## Scope

Design and implement a persistence abstraction layer that any game engine can use to record session lifecycle
events and per-game state to the database. The game engines own their logic; this layer is the plumbing.

## Proposed Approach (to be confirmed in planning)

- A shared backend utility/service that game engines call to record: session start, each move, session end +
  outcome
- Each game has its own DB table to accommodate different state shapes
- The abstraction layer handles: connection management, transaction handling, error handling, OTel instrumentation
- Game engines do not interact with the DB directly — all persistence goes through this layer
- When the WebSocket feature is implemented, this layer hooks into WebSocket message handling rather than (or in
  addition to) REST handlers

## Known Requirements

- Must not block the game response — DB writes should not add latency to the player's move
- Each game has a different state shape; the abstraction layer must accommodate per-game schemas without coupling
  game logic to persistence logic
- Must integrate with OTel (spans for DB write operations)
- Data captured must be sufficient to: reconstruct/replay a game, compute win/loss/draw stats per user, and
  support future ML model training data pipelines
- Must work with both REST and WebSocket game traffic (see websocket spec)

## Open Questions

### Architecture
- Async vs. synchronous writes? Fire-and-forget (best-effort) vs. confirmed write before responding to client?
- Should this be a Python class, a module of functions, or a FastAPI background task dependency?
- Event-driven model (game engine emits events, layer subscribes) vs. direct call model (engine calls
  persistence functions explicitly)?

### Schema Design
- One generic `game_events` table (event type + JSON payload) vs. per-game tables with typed columns?
- What is the minimum per-game schema? (session_id, user_id, game_id, started_at, ended_at, outcome,
  move_count, move_log?)
- How are in-memory sessions migrated to DB-backed sessions at launch?

### Data Requirements
- What data attributes are needed for ML model training vs. just stats?
- Should individual moves be stored (full move log) or only final state?
- Retention / archival policy for game history?

### Multi-game Coordination
- When multiple games are active simultaneously, how is connection pooling managed across concurrent writes?
- Does each game get its own DB connection or share a pool?

## Test Cases

_To be defined during planning session._
