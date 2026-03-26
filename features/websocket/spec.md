# WebSocket Feature Spec

## Background

Currently all game interactions (start, move, complete) use REST API calls. Real-time games like Pong require
continuous bidirectional communication. Even turn-based games (TTT, Connect4, Chess, Checkers, Dots & Boxes) would
benefit from WebSocket connections to reduce per-move overhead, keep game traffic off the REST API, and enable
future real-time features.

## Proposed Scope

- Establish a WebSocket infrastructure layer (server + client)
- **Confirmed use case**: Pong requires real-time bidirectional communication and cannot use REST for its game
  loop; WebSocket support is required before Pong can be implemented
- **Open question**: whether turn-based game moves (TTT, Connect4, Chess, Checkers, Dots & Boxes) should also
  migrate from REST to WebSocket, or remain as REST calls — see Open Questions below
- REST API remains for non-game interactions regardless: auth, game metadata, game list, user stats

## Known Requirements

- Must support continuous bidirectional communication for Pong (high-frequency game loop)
- Whether low-frequency turn-based game moves use WebSocket is an open question (see below)
- Must integrate with existing session-cookie authentication
- Same observability/logging requirements as REST (OTel spans, structured logs via GCP Cloud Logging)
- Must work across mobile and desktop clients (browser WebSocket API)
- Game data capture (see game-data-persistence spec) must hook into WebSocket message handling

## Open Questions

### Goals & Use Cases
- What is the primary driver: latency reduction, real-time AI feedback, or architectural cleanliness?
- Are there use cases beyond game moves — e.g., live spectating, multi-player, AI commentary?
- Should the WebSocket layer be designed to support future multiplayer (player vs. player), or single-player only?

### Architecture
- Should turn-based game moves (TTT, Connect4, Chess, Checkers, Dots & Boxes) migrate from REST to WebSocket,
  or remain as standard HTTP request/response calls? Pros and cons to be evaluated in planning session.
- Server is always authoritative for game state — clients accept server state unconditionally on reconnect
  or desync (consistent with error-handling and game-data-persistence specs).
- One shared WebSocket connection per client, or one connection per active game session?
- Message protocol: JSON envelope with type/payload fields, or game-specific schemas?
- How does a WebSocket connection map to DB-backed game sessions on the backend? (In-memory sessions are
  replaced by DB-backed sessions per game-data-persistence spec — this applies to WebSocket connections too)
- Should the backend emit unprompted messages (e.g., AI move response pushed after server computes it)?

### Error Handling & Recovery
Real-time games (Pong and future equivalents) do not support session recovery. A disconnect resets to a new
game — continuous game state is intentionally not persisted between connections. Error handling for
WebSocket connections must be standardized to the same degree as HTTP error handling (see error-handling
spec): connection lifecycle events (open, close, error) must be classified, surfaced to the user
consistently, and instrumented via OTel (see observability spec WebSocket note). The specific retry and
reconnect strategy for real-time games is an open question for this spec's planning session.

### Infrastructure
- FastAPI native WebSocket support vs. third-party library (e.g., Socket.IO, channels)?
- Connection lifecycle: who initiates close, what triggers server-side cleanup, idle timeout?
- Reconnection strategy: how does the client re-attach to an in-progress game session after a disconnect?
- Heartbeat / keep-alive interval?

### Auth & Security
- How is the session cookie validated during the WebSocket handshake?
- Rate limiting on inbound WebSocket messages?
- What happens if the same user opens the same game in two browser tabs simultaneously?

### Deployment
- Cloud Run WebSocket timeout: default is 300s, max 3600s — what is the right value for game sessions?
- Any changes needed to Cloud Run concurrency or load balancer settings for long-lived connections?

### Observability
- How are WebSocket messages traced in OTel (no HTTP request spans)?
- What events should be instrumented: connection open/close, each message, errors, latency?
- How do we distinguish game WebSocket traffic in logs from REST API traffic?

## Test Cases

_To be defined during planning session._
