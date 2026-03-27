# ADR: Turn-Based Game Architecture

## Context

TTT is the first game implemented under the new architecture. The decisions made here define the shared
patterns for all subsequent turn-based games (Connect4, Checkers, Chess, Dots & Boxes).

## Decisions

### 1. SSE over WebSocket for turn-based games

Turn-based games require only server→client push after a player move. SSE is HTTP-native,
auto-reconnecting via the browser `EventSource` API, and sufficient for this communication pattern.
WebSocket is more complex and is already scoped to the `features/websocket/` spec for Pong. The open
question in that spec about whether turn-based games should use WebSocket is now closed: SSE handles all
turn-based games; WebSocket is Pong-only.

Cloud Run request timeout must be raised to 3600s to support persistent SSE streams.

### 2. `GameEngine` / `AIStrategy` / `MoveProcessor` / `StatusBroadcaster` abstractions

Separating these concerns allows each game to implement its own engine and AI strategy while sharing all
infrastructure for validation, retry logic, OTel instrumentation, and status pacing.

- `GameEngine`: pure game rules (stateless, deterministic)
- `AIStrategy`: move generation (may produce invalid moves; no guarantee of validity)
- `MoveProcessor`: validation, retry, fallback to random, persistence orchestration
- `StatusBroadcaster`: rate-limits SSE events to a human-readable cadence (2.5s min interval)

### 3. `/resume` always called on page load

No reliable way to distinguish a page refresh from natural navigation at the client level, and the
distinction does not change the correct behavior. The server is always authoritative. `/resume` is always
called on load; the response fully determines what the client renders.

`localStorage` (`ttt_game_hint`, 10-minute TTL) is used only as a UX hint to decide whether to show a
loading skeleton or the new game UI during the in-flight request. It is not a source of truth.

### 4. `/newgame` instead of `/start`

`/start` is ambiguous — it does not clearly communicate that it ends an existing session. `/newgame` is
explicit: it is only called when the player consciously chooses to begin a fresh game, and it always closes
any existing active session first.

### 5. `player_starts: bool` instead of `player_symbol: "X" | "O"`

Aligns with the project-wide DB convention of using booleans for simple binary states instead of enum-like
strings (which require transformation and are slower to query). `player_starts: true` means the player
goes first (plays as X); `false` means the AI goes first (player plays as O).

### 6. Session ID is ephemeral on the client

`session_id` is received from `/resume` or `/newgame` and used only for the SSE subscription URI. It is
not stored in `localStorage` or encoded in the URL. Move requests carry no `session_id`; the server
derives the active session from the authenticated user + game type.

### 7. Session timeout is configurable per game via DB

The `games` table gains a `session_timeout_hours` column. Abandoned sessions (no moves past the timeout)
are cleaned up by a GCP Cloud Scheduler job calling an internal endpoint, not by the application on
startup. This keeps the app stateless and the cleanup observable and independently scheduled.

### 8. No AI difficulty

The AI difficulty parameter is removed from the entire stack. The `games` table retains its `difficulty`
column as human-facing game metadata (indicating how challenging the game is for players). This is
distinct from AI difficulty and is not a parameter for game sessions.

### 9. Auth required; no anonymous gameplay

A permanent constraint tied to player profile and training data capture from day one. Unauthenticated
users see a login prompt on game pages. All game endpoints return 401 for unauthenticated requests.

### 10. One active session per user per game type

Enforced by the existing DB partial unique index. `/newgame` always closes any existing active session
before creating a new one. The `get_or_create_game_session` pattern in the persistence service is not
used for the new-game flow; instead the start handler explicitly closes then creates.
