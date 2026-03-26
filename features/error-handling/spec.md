# Error Handling & Resilience Spec

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
- Session resume: "continue your last game?" prompt on login or game page navigation when an in-progress
  session exists
- Session expiry detection and prompt to re-authenticate

**Backend:**
- Consistent error response shape across all `/api/*` endpoints
- On move validation failure or server error: return the last valid game state alongside the error, so the
  client can resync without a separate request
- Structured error logging with enough context to diagnose issues (GCP Cloud Logging only — alerting
  configured separately in GCP if/when needed)
- Clear 4xx vs 5xx distinction: user errors vs. server errors

## Mid-Game Error Recovery Flow

```
Client sends move
  └─ Transient error (timeout, network, 503)
       ├─ Retry up to N times with backoff
       ├─ On retry success: accept server-returned game state (source of truth)
       └─ On retry exhaustion: push to global notification service, do not advance local state

  └─ Server-side failure (4xx invalid move, 5xx corruption/offline)
       ├─ Do not retry
       ├─ Reject the move — local board reverts to last confirmed server state
       └─ Show inline error; user can attempt the move again or navigate away

  └─ Client reconnects after disconnect (any cause)
       ├─ Re-fetch game state from server on reconnect
       ├─ If in-progress session found: offer "continue your last game?" via global notification
       └─ Server state overwrites any local state unconditionally
```

## Global Notification Service

Handles errors and events that are not tied to a specific user action or component — session expiry, backend
failures, connectivity errors surfaced after retry exhaustion, session resume prompts.

**Store (Zustand):**
- Queue of notification objects: `{ id, level, title, description, timer?, timestamp }`
- Levels: `info | warning | error`
- Dedup logic: if an identical notification (same level + title + description) is currently displayed
  (pre-fade-out), ignore the new push — no cooldown counter needed, just check active set
- Queue cap: maximum N notifications visible simultaneously; additional notifications wait and follow as
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
- Crash loop detection via localStorage, keyed by route context:
  - Increment crash counter on each boundary catch
  - Reset counter on successful render (componentDidUpdate / useEffect)
  - If counter exceeds threshold (e.g., 3): remove "Reload page" option, show "Go home" only
  - This handles the case where a reload reproduces the crash deterministically
- Error boundaries log to OTel (see observability spec)

## Network Offline Detection

Not implemented. For discrete-move games the user is idle between moves and the next API call either
succeeds or enters the transient error retry path. For real-time games, WebSocket disconnect events handle
connectivity loss. A proactive offline banner adds complexity for a case that is already covered.

## Known Requirements

- Error responses from the backend must follow a consistent JSON shape:
  `{ "detail": "...", "game_state": {...} }` — current game state included so clients can resync in one
  round-trip
- Frontend error states must not leave the user with a blank screen or a spinner that never resolves
- Session expiry must redirect or prompt the user to log in — not silently fail
- All React error boundaries must log to OTel (see observability spec)
- 404 page must be styled consistently with the rest of the site
- Retry logic must be implemented in a shared API client utility, not duplicated per component

## Open Questions

- Retry count and backoff interval for transient failures — what values are appropriate given Cloud Run
  cold start latency (~1–2s)? (Implementation detail, to be decided during implementation)
- Session cutoff for "continue your last game?" prompt — how old is too old to offer resume?
  (Coordinate with game-data-persistence spec open questions)

## Test Cases

_To be defined during planning session._
