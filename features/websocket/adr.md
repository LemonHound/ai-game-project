# ADR: WebSocket Infrastructure

## Context

The site needed real-time bidirectional communication for Pong — continuous ball physics state at 30Hz
and player paddle input. REST (request/response) and SSE (server→client only) are both unsuitable for
this pattern. A WebSocket infrastructure layer was required. The question was how broadly to scope it
and what constraints to apply.

## Decisions

### 1. WebSocket is scoped exclusively to Pong

Turn-based games (TTT, Connect4, Chess, Checkers, Dots & Boxes) have already been spec'd using SSE for
server→client push and REST for player moves. SSE is sufficient for those patterns: they require only
server push after a player action, not continuous bidirectional frames. Extending WebSocket to
turn-based games would add complexity without benefit.

WebSocket handles Pong only. All other traffic remains REST + SSE.

### 2. FastAPI native WebSocket — no third-party library

FastAPI's built-in `WebSocket` support handles the handshake, message framing, and connection
lifecycle for a single-game use case. Socket.IO and similar libraries add protocol overhead, version
coupling, and transport negotiation complexity. For one game type with a well-defined protocol, the
native API is sufficient.

### 3. Authentication on upgrade, not after

The session cookie is validated during the HTTP upgrade handshake. If the cookie is missing or
invalid, the server returns 403 and the upgrade is rejected before a WebSocket is established. This
is simpler and safer than allowing unauthenticated connections and checking auth on the first message.

Rationale: auth-after-upgrade creates a window where an unauthenticated client holds a connection
slot. Rejecting at the handshake eliminates this and is consistent with how auth works on HTTP
endpoints.

### 4. One connection per game session; duplicate tab eviction

If a second connection is opened for the same session (duplicate tab), the server closes the first
connection with code 4001 and accepts the new one. The alternative — rejecting the new connection —
is worse UX: the player opening a tab expects the new tab to work, not to be silently blocked.

In-memory `PongSession` state is keyed by `session_id` in a module-level dict, enabling the eviction
check on connect.

### 5. No session recovery on disconnect

Pong is a real-time game with server-authoritative physics running at 60Hz. Reconnecting mid-game
would require the server to hold physics state across connection boundaries, which adds complexity
without proportionate value for a casual game to 7 points. On disconnect the server tears down the
in-memory game state.

This decision is revisited if the game proves popular and users are frustrated by dropped connections.

### 6. JSON message envelope, no binary frames

All messages in both directions use `{"type": "<event_type>", "payload": {...}}`. Binary frames
would reduce payload size but complicate debugging and add an encoding/decoding layer. At 30Hz push
frequency over a local or LAN connection the overhead is negligible. Binary encoding is a future
optimization if bandwidth or latency becomes a measured problem.

### 7. No AI difficulty parameter in the connection protocol

The `start_game` message carries an empty payload `{}`. The Pong spec establishes no difficulty
setting exposed to the player anywhere on the site. The `games` table `difficulty` column is a static
display label (e.g. "Medium") describing game complexity for humans — it is not a runtime parameter.
Including `difficulty` in the WebSocket protocol would create a mismatch between the UX (no selection)
and the wire format.

### 8. Cloud Run timeout set to 600s

Cloud Run's default request timeout is 300s. WebSocket connections are long-lived HTTP upgrades. A
game to 7 points averages roughly 3.5 minutes; 600s provides double the headroom. The server-side
idle timeout (60s) ensures connections self-terminate well before the Cloud Run limit.

### 9. WebSocket router in a dedicated module

The WebSocket endpoint lives in `src/backend/ws_pong.py`, not in `games.py`. FastAPI's dependency
injection (`Depends(...)`) does not work the same way on WebSocket routes as on HTTP routes.
Isolating the WebSocket handler avoids polluting the games router with WS-specific connection
management code.
