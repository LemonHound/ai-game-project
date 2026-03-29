# WebSocket Feature Spec

**Status: finalized**

## Background

All current game interactions use REST (turn-based) or SSE (server→client push for turn-based games). Real-time
games like Pong require continuous bidirectional communication that neither REST nor SSE can support. This feature
establishes a WebSocket infrastructure layer used exclusively by Pong. REST and SSE remain unchanged for all
other traffic.

## Resolved Decisions

- **Scope**: WebSocket is scoped exclusively to Pong. Turn-based games (TTT, Connect4, Chess, Checkers, Dots & Boxes)
  continue to use SSE for server→client push and REST for moves. No shared WS connection per client.
- **Auth required**: Authentication is required to open a WebSocket connection. The session cookie is validated
  during the HTTP upgrade handshake. If the cookie is missing or invalid, the server responds with 403 and the
  upgrade is rejected before a WebSocket is established.
- **One connection per game session**: Each active game session has exactly one WebSocket connection. If a second
  connection is opened for the same session (e.g., duplicate tab), the server closes the first connection with
  code 4001 and accepts the new one.
- **No session recovery**: Pong does not support reconnect-to-in-progress-game. A disconnect resets to a new
  game. The server tears down in-memory game state on close.
- **Message protocol**: JSON envelope `{"type": "<event_type>", "payload": {...}}` for all messages in both
  directions. No binary frames.
- **Idle timeout**: Server closes idle connections after 60 seconds with code 4002. Normal game activity
  (player input messages) resets the idle timer.
- **Heartbeat**: Server sends a heartbeat message every 30 seconds on connections that have not received a
  player input in that window, to distinguish idle-but-alive from dropped connections.
- **FastAPI native WebSocket**: No third-party library (no Socket.IO, no channels). FastAPI's built-in
  `WebSocket` support is sufficient.
- **Server authoritative**: Server owns all game state. Clients accept server state unconditionally.

## Architecture

### Endpoint

```
GET /ws/pong/{session_id}
Upgrade: websocket
Cookie: session=<token>
```

The session cookie is extracted and validated before the WebSocket handshake completes. `session_id` must
correspond to an active Pong session owned by the authenticated user. Mismatch returns 403.

The WebSocket router lives in a new `src/backend/ws_pong.py` module, registered on `app` (not on the games
API router, since WebSocket endpoints cannot use FastAPI dependency injection the same way as HTTP routes).

### Message Types

**Server → Client**

| type | payload | when |
|------|---------|------|
| `game_state` | `{ball: {x,y,vx,vy}, player_y, ai_y, score: {player,ai}, status}` | every server push tick (~30Hz) |
| `game_over` | `{winner: "player"\|"ai", score: {player,ai}}` | win condition reached |
| `error` | `{code, message}` | malformed client message or server fault |
| `heartbeat` | `{}` | every 30s when no player input received |

**Client → Server**

| type | payload | when |
|------|---------|------|
| `player_input` | `{action: "up"|"down"|"none"}` | on player input change (key/button press and release) |
| `start_game` | `{difficulty: "easy"\|"medium"\|"hard"}` | once, after connection established |

### Connection Lifecycle

```
Client opens WS → server validates cookie + session_id → sends initial game_state (paused)
Client sends start_game → server begins game loop
[game loop runs: physics → AI → push game_state at 30Hz]
[player sends player_input events as paddle moves]
Win condition reached → server sends game_over → server closes connection (code 1000)
Client disconnect → server closes game loop, discards in-memory state
Idle 60s → server sends error {code: 4002} → closes connection
Duplicate tab → server closes first connection (code 4001) → accepts new one
```

### In-Memory Game State

The server maintains an in-memory `PongSession` object per active WebSocket connection. It is never persisted
between connections. Rally data (for RL training) is flushed to the DB asynchronously when a point is scored
(see Pong spec). The `PongSession` is keyed by `session_id` in a module-level dict, enabling the duplicate-tab
eviction logic.

### OTel Instrumentation

WebSocket connections do not produce HTTP request spans. Instrumentation is manual:
- Span opened on connection upgrade (attributes: `session_id`, `user_id`, `game=pong`)
- Span closed on connection close (attributes: `close_code`, `duration_ms`, `points_played`)
- `game.ws.messages_received` counter (per-connection, flushed on close — not per-message to avoid cardinality explosion)
- `game.ws.messages_sent` counter (same)
- Error events recorded on the open span for malformed messages and server faults

Log lines use `logger` (not `print`), structured with `session_id` and `user_id` in `extra`.

### Cloud Run Considerations

- Cloud Run default request timeout is 300s. WebSocket connections are long-lived HTTP upgrades.
- Set `--timeout 600` on the Cloud Run service. A game to 7 points averages ~3.5 minutes; 600s gives double the headroom without inflating costs.
- The server-side idle timeout (60s) means connections self-terminate well before the Cloud Run limit.
- No load balancer changes required for single-instance development; session affinity is not needed since
  each session maps to one connection on one instance. If horizontal scaling is added later, in-memory
  `PongSession` state must be moved to a shared store (out of scope for v1).

## Test Cases

| # | Scenario | Tier | Test Name |
|---|----------|------|-----------|
| 1 | WS connection established with valid session cookie | API integration | `ws_connects_with_valid_auth` |
| 2 | Connection rejected (403) with missing session cookie | API integration | `ws_rejects_missing_cookie` |
| 3 | Connection rejected (403) with invalid/expired session | API integration | `ws_rejects_invalid_cookie` |
| 4 | Connection rejected (403) when session_id doesn't match authenticated user | API integration | `ws_rejects_session_mismatch` |
| 5 | Server pushes `game_state` messages after `start_game` | API integration | `ws_server_pushes_game_state` |
| 6 | Server sends `heartbeat` after 30s of no player input | API integration | `ws_heartbeat_sent` |
| 7 | Server closes connection with 4002 after 60s idle | API integration | `ws_idle_timeout_closes` |
| 8 | Malformed client message results in `error` frame | API integration | `ws_error_on_bad_message` |
| 9 | OTel span created on open and closed on disconnect | API integration | `ws_otel_connection_spans` |
| 10 | Duplicate tab: first connection closed with 4001 | E2E | `ws_duplicate_tab_closes_first` |
| 11 | Network drop mid-game: client surfaces disconnect state to user | E2E | `ws_disconnect_surfaces_to_ui` |
| 12 | Idle connection closed by server — verify in Cloud Run logs | manual | Open game, leave idle 60s, check structured log for close event |
