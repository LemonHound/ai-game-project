# Error Handling & Resilience Spec

**Status: done**

## Background

There is currently no consistent error handling strategy across the frontend or backend. API failures during
gameplay have undefined behavior from the user's perspective. There is no 404 page. React error boundaries
are not implemented. Session expiry during a game is not handled gracefully.

## Design Principles

These flow from the game-data-persistence model and apply to all discrete-move games:

1. **Server is source of truth.** On any error, desync, or reconnect, the client re-fetches server state
   and overwrites local state. The client never assumes its local game state is authoritative.
2. **Games are always recoverable.** Since every valid move is persisted to DB (see game-data-persistence
   spec), a disconnection or error does not lose game progress. The server can always reconstruct the last
   valid state.
3. **Errors are classified, not generic.** Transient errors (network blip, timeout, 503 cold start) trigger
   retry-and-resync. Server-side failures (data corruption, invalid state, server offline) surface to the
   user and reject the move without losing prior state.

**Exception: real-time games (Pong and future equivalents).** Continuous-state games do not support session
recovery. A disconnect resets to a new game. Error handling for real-time games is standardized separately
in the websocket spec.

**Dependency:** the session recovery model described here requires game-data-persistence to be implemented
first. Until DB-backed sessions and write-on-every-move are in place, recovery is not possible.

## Scope

**Frontend:**
- 404 / unknown route page
- React error boundaries with crash loop detection (see below)
- Global notification service for indirect errors (see below)
- Inline error display using the shared notification display component
- API error classification: transient vs. server-side failure, with different UX responses
- Mid-game error recovery: retry-and-resync for transient failures; move rejection with error message for
  server-side failures
- Session resume: "continue your last game?" prompt on login and game page navigation when an in-progress
  game session exists (cutoff: 30 days — sessions older than this are marked abandoned and not offered
  for resume; see game-data-persistence spec)
- Auth expiry detection and prompt to re-authenticate
- Unauthenticated users who attempt to start a game receive a login prompt modal — gameplay requires auth

**Backend:**
- Consistent error response shape across all `/api/*` endpoints
- On move validation failure or server error: return the current board state alongside the error so the
  client can resync without a separate request
- Structured error logging with enough context to diagnose issues (GCP Cloud Logging only — alerting
  configured separately in GCP if/when needed)
- Clear 4xx vs 5xx distinction: user errors vs. server errors
- Dedicated state recovery endpoint for catastrophic client rebuilds and game resume (see below)

## Error Response Shape

Game endpoints (`/api/game/*`) error responses follow:

```json
{ "detail": "...", "board_state": { ...board_state from game record... } }
```

`board_state` is the full `board_state` JSONB from the `{game_type}_games` record — the complete board
representation after the most recent move. The client is responsible for parsing what it needs.
`board_state` is `null` if no moves have been made yet (e.g. game record just created).

All other `/api/*` endpoints (auth, health, metadata) return the standard FastAPI error shape:

```json
{ "detail": "..." }
```

## State Recovery Endpoint

```
GET /api/games/{game_type}/session/{id}
```

Returns the current full board state for a session. Used in two cases:
1. Catastrophic client error (React error boundary catch, total UI rebuild) — client re-fetches to
   reconstruct the board without relying on local state
2. Game resume — user elects to continue an in-progress session; client fetches current state before
   rendering the board

Response shape is the same `board_state` object returned in error responses — one format, two uses.

## Mid-Game Error Recovery Flow

```
Client sends move
  └─ Transient error (timeout, network, 503)
       ├─ TanStack Query retry handles retries with backoff (retry count and interval configured
       │  in TanStack Query's global defaults — implementation detail)
       ├─ On retry success: accept server-returned game state (source of truth)
       └─ On retry exhaustion: push to global notification service, do not advance local state

  └─ Server-side failure (4xx invalid move, 5xx corruption/offline)
       ├─ Do not retry
       ├─ Reject the move — local board reverts to last confirmed server state (from error response
       │  board_state field)
       └─ Show inline error; user can attempt the move again or navigate away

  └─ Client reconnects after disconnect (any cause)
       ├─ Re-fetch game state via GET /api/games/{game_type}/session/{id}
       ├─ If in-progress game found (< 30 days): offer "continue your last game?" via global
       │  notification
       └─ Server state overwrites any local state unconditionally
```

**Retry ownership:** TanStack Query's built-in `retry` / `retryDelay` options are the sole retry
mechanism. No custom retry wrapper in the API client — TanStack Query is the library for this.

## Global Notification Service

Handles errors and events that are not tied to a specific user action or component — auth expiry, backend
failures, connectivity errors surfaced after retry exhaustion, session resume prompts.

**Store (Zustand):**
- Queue of notification objects: `{ id, level, title, description, timer?, timestamp }`
- Levels: `info | warning | error`
- Dedup logic: if an identical notification (same level + title + description) is currently displayed
  (pre-fade-out), ignore the new push — no cooldown counter needed, just check active set
- Queue cap: maximum 3 notifications visible simultaneously; additional notifications wait and follow as
  active ones fade out
- Timer management: auto-dequeue after timer elapses; timeless notifications persist until dismissed

**Renderer component (floating):**
- Reads from Zustand store
- Handles fade in / wait / fade out animation per notification
- Stacking and follow-fade effect as notifications clear
- Positioned as a top-level overlay, not within any game or page component

**Display component (shared):**
- The visual representation of a single notification (level, title, description)
- Used by the floating renderer for global notifications
- Also used directly with props for inline errors — no store involvement, no queue or dedup logic
- Style may differ between floating and inline contexts; keeping them as separate usages of the same
  base component allows independent styling without shared-state complexity

**Inline errors** (direct component usage):
- Form validation, move failures, login errors — shown in context, adjacent to the component that errored
- Receive props directly; do not interact with the global store
- No dedup or queue logic needed — inline errors are immediate and tied to a single user action

## React Error Boundaries

- Applied at the route/page level (not globally, not per-component)
- Catch rendering errors and show a fallback UI with two options: "Reload page" and "Go home"
- On catch: call `GET /api/games/{game_type}/session/{id}` to re-fetch server state before
  re-rendering (if a game session is active)
- Crash loop detection via localStorage, keyed by route path:
  - Increment crash counter on each boundary catch
  - Reset counter on successful render (useEffect on mount)
  - If counter exceeds 3: remove "Reload page" option, show "Go home" only — handles the case where
    a reload deterministically reproduces the crash
- Error boundaries log to OTel (see observability spec)

## Network Offline Detection

Not implemented. For discrete-move games the user is idle between moves and the next API call either
succeeds or enters the TanStack Query retry path. For real-time games, WebSocket disconnect events handle
connectivity loss. A proactive offline banner adds complexity for a case that is already covered.

## Known Requirements

- Game endpoint error responses must follow the `{ "detail": "...", "board_state": {...} }` shape; non-game endpoints return `{ "detail": "..." }` only
- Frontend error states must not leave the user with a blank screen or a spinner that never resolves
- Auth expiry must redirect or prompt the user to log in — not silently fail
- All React error boundaries must log to OTel (see observability spec)
- 404 page must be styled consistently with the rest of the site
- Retry logic is owned entirely by TanStack Query — no duplicate retry in a custom API client

## Test Cases

| Tier | Name | What it checks |
|------|------|----------------|
| Unit | `unit/test_error_shapes.py::test_error_response_includes_board_state` | Error response serializer includes `board_state` from last move row |
| Unit | `unit/test_error_shapes.py::test_error_response_null_board_state_no_moves` | `board_state` is null when session has no moves yet |
| API integration | `api/error-handling.spec.ts::invalid_move_returns_board_state` | 4xx response to invalid move includes current `board_state` |
| API integration | `api/error-handling.spec.ts::session_recovery_endpoint_returns_board` | `GET /api/games/{game_type}/session/{id}` returns correct board state |
| API integration | `api/error-handling.spec.ts::session_recovery_404_unknown_session` | Recovery endpoint returns 404 for unknown session_id |
| API integration | `api/error-handling.spec.ts::unauth_game_start_rejected` | Unauthenticated request to start a game returns 401 |
| API integration | `api/error-handling.spec.ts::game_endpoints_consistent_error_shape` | Every `/api/game/*` endpoint returns `{ detail, board_state }` shape on error; non-game endpoints return `{ detail }` only |
| E2E | `e2e/error-handling.spec.ts::404_page_renders` | Navigating to unknown route renders 404 page |
| E2E | `e2e/error-handling.spec.ts::inline_error_on_invalid_move` | Invalid move surfaces inline error, board does not advance |
| E2E | `e2e/error-handling.spec.ts::error_boundary_renders_fallback` | Simulated render error triggers error boundary fallback UI |
| E2E | `e2e/error-handling.spec.ts::crash_loop_hides_reload_option` | Three consecutive boundary catches removes "Reload page" option |
| E2E | `e2e/error-handling.spec.ts::resume_prompt_on_login` | Login with an in-progress game session shows resume prompt |
| E2E | `e2e/error-handling.spec.ts::resume_prompt_on_game_nav` | Navigating to a game page with in-progress session shows resume prompt |
| E2E | `e2e/error-handling.spec.ts::new_game_abandons_prior_session` | Starting a new game when one is in-progress marks prior as abandoned |
| Manual | Browser devtools | Simulate offline mid-game: move submission enters retry state, board does not advance |
| Manual | Browser devtools | Simulate 503 response: TanStack Query retry fires, success on retry restores board |
