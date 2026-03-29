# Game: Pong

**Status: finalized — depends on websocket (finalized)**

## Background

Unlike the other games, Pong has no backend implementation. The existing `src/frontend/public/js/pong.js` is
entirely client-side — a canvas-based game loop using `requestAnimationFrame`. This spec replaces that
implementation with a React component backed by a server-authoritative physics loop and a server-side AI.
The React page at `src/frontend/src/pages/games/PongPage.tsx` is currently a stub.

## Resolved Design Decisions

- **Auth required**: No unauthenticated gameplay. Game page displays a login prompt blocking the game UI for
  unauthenticated users. Consistent with all other games.
- **Server-authoritative**: Server owns ball position, both paddle positions, velocity, and score at all times.
  The client renders whatever state the server sends. No client-side physics simulation.
- **Transport**: WebSocket exclusively (see `features/websocket/spec.md`). No REST for game loop traffic.
- **No difficulty selection**: There is no difficulty setting exposed to the player anywhere on the site. The
  `difficulty` field on `game_sessions` records the AI's training quality level at the time the session was
  created (see `features/game-training-data/spec.md`). This is opaque to the player.
- **AI implementation (v1)**: Simple reactive heuristic. Each tick: if the ball's center Y is above the top
  edge of the AI paddle, the AI moves up; if below the bottom edge, the AI moves down; otherwise stationary.
  This logic is isolated in a replaceable function — an RL policy network is a future drop-in upgrade with no
  other code changes required.
- **Win condition**: First to 7 points wins. Not configurable in v1.
- **No session recovery**: Disconnect resets to a new game. In-progress game state is discarded on close.
- **Rally capture (stub)**: In-memory buffer per rally (serve to point scored). On point scored, a stub
  function is called that discards the buffer. The stub signature, buffer format, and integration points are
  fully wired — replacing the stub body with a real DB write is the only change needed when the training data
  schema is defined (see `features/game-training-data/spec.md`).
- **Existing pong.js**: Replaced entirely. `src/frontend/public/js/pong.js` is deleted; all logic moves into
  the React component tree.

## Architecture

### Server-Side Game Loop

The server runs the authoritative game loop as an `asyncio` task spawned when the WebSocket connection
receives a `start_game` message. The loop runs at 60Hz (16ms tick). The server pushes `game_state` to the
client at 30Hz (every 2 ticks).

Each tick:
1. If in serve state and countdown active: decrement countdown, hold ball at center, push state
2. Apply ball physics: update position by velocity, check wall bounces (top/bottom)
3. Check paddle collisions: if ball intersects a paddle, reflect with angle based on contact offset
4. Check scoring: if ball exits left/right boundary, increment score, begin serve sequence
5. Compute AI action: compare ball Y to AI paddle edges → `up`, `down`, or `none`
6. Apply AI paddle movement at fixed speed
7. Apply player paddle movement from latest received action at fixed speed
8. Clamp both paddles to canvas bounds
9. Check win condition: if either score reaches 7, push `game_over`, close connection
10. On every other tick (30Hz): push `game_state` to client

### Movement Model

Movement is binary for both player and AI. On each tick, a paddle either moves at its fixed speed or is
stationary. There is no acceleration or gradual deceleration.

| Constant | Value |
|----------|-------|
| Paddle move speed | 8 px/tick (both player and AI) |

The player sends `{action: "up"|"down"|"none"}` messages event-driven — on key/button press and on release.
The server applies the most recently received action each tick. The AI action is computed fresh each tick
from ball position.

### Ball Physics

#### Serve Sequence

After a point is scored (or at game start), the ball is placed at the center of the canvas. A 1.5-second
countdown is displayed. The ball then launches toward the player who just scored at a random angle in the
range `[-25°, 25°]` from horizontal. This range ensures the ball will reach the player paddle before it
reaches the top or bottom wall from a center-start position.

At game start (first serve), the ball launches toward the player.

#### Paddle Reflection

When the ball contacts a paddle, the reflection angle is determined by where on the paddle the ball lands:

```
offset = (ball_center_y - paddle_center_y) / (paddle_height / 2)  // range [-1.0, 1.0]
reflection_angle = offset * 45°
new_vx = speed * cos(reflection_angle)  // sign determined by direction of travel
new_vy = speed * sin(reflection_angle)
```

Contact at the paddle center → 0° (straight horizontal). Contact at the top or bottom edge → ±45°.
Ball speed increases by `0.2 px/tick` on each paddle contact, capped at `12 px/tick`.

#### Wall Bounce

Top and bottom walls reflect `vy` (flip sign). No angle change.

### Physics Constants

| Constant | Value |
|----------|-------|
| Canvas width (logical) | 800px |
| Canvas height (logical) | 400px |
| Paddle width | 15px |
| Paddle height | 80px |
| Ball diameter | 12px |
| Ball base speed | 4 px/tick |
| Ball max speed | 12 px/tick |
| Ball speed increment per paddle hit | 0.2 px/tick |
| Max reflection angle | 45° |
| Serve random angle range | ±25° from horizontal |
| Serve countdown | 1500ms |

### Rally Buffer (Stub)

During each rally, the server accumulates a list of sampled state snapshots in memory, one every 3 ticks
(~50ms). Each snapshot: `{ball_x, ball_y, ball_vx, ball_vy, player_y, ai_y, ai_action, tick_index}`.

On point scored, `flush_rally(session_id, rally_index, winner, duration_ms, buffer)` is called. The stub
implementation discards the buffer and returns immediately. The function signature is final.

On disconnect mid-rally, the buffer is discarded without calling `flush_rally`.

### Frontend Component Structure

```
PongPage
  └── PongGame
        ├── useWebSocket       hook: WS connection lifecycle, parse messages, send player_input
        ├── usePongCanvas      hook: canvas ref, requestAnimationFrame render loop
        └── PongControls       component: gamepad UI + keyboard label
```

**`useWebSocket`** owns the connection lifecycle (open, close, error). Exposes latest `game_state` as state
and a `sendAction(action)` function.

**`usePongCanvas`** owns the `<canvas>` ref and the render loop. Renders server-provided state on each
animation frame. No physics. Cleanup on unmount: cancel `requestAnimationFrame`.

**`PongControls`** renders the gamepad area and the keyboard label. Owns the input event listeners
(keyboard, gamepad mouse/touch). Calls `sendAction` when the player input state changes.

### Gamepad Design

The gamepad is rendered to the right of the canvas at the same height as the gameplay area. It is a single
touch/click region divided visually into two halves (up / down) by a horizontal line. It is not two
separate buttons — it is one interactive area.

Behavior:
- Pointer down in top half → send `action: up`; pointer down in bottom half → send `action: down`
- While pointer is held, dragging to the opposite half sends the opposing action
- Pointer up (anywhere) → send `action: none`

This works identically for mouse and touch input. No special mobile handling needed.

A label below or beside the gamepad reads: `↑ ↓  arrow keys also work`.

### Error and Disconnect Handling

| Close code | UI behaviour |
|------------|-------------|
| 1000 (normal, game over) | Final score overlay; "Play Again" button starts new game |
| 4001 (duplicate tab) | "Game opened in another tab." No reconnect option |
| 4002 (idle timeout) | "Disconnected due to inactivity." "Play Again" button |
| Any other / error event | Generic disconnect message; "Play Again" button |

Server `error` message type: displayed inline in game UI without disconnecting.

`game_over` flow: server sends `game_over` payload `{winner, score}`, then closes with code 1000. Client
shows an overlay on the canvas with the final score and a "Play Again" button. "Play Again" opens a new
WebSocket connection (new game session).

## Test Cases

| # | Scenario | Tier | Test Name |
|---|----------|------|-----------|
| 1 | Canvas renders at correct logical dimensions and scales to viewport | unit | `pong_canvas_scales_to_viewport` |
| 2 | Paddle reflection angle at center = 0° (horizontal) | unit | `pong_reflection_center_is_flat` |
| 3 | Paddle reflection angle at top edge ≈ -45° | unit | `pong_reflection_top_edge_steep` |
| 4 | Serve angle is within ±25° of horizontal | unit | `pong_serve_angle_in_range` |
| 5 | WS connection opened and `start_game` sent on game start | API integration | `pong_ws_connects_on_start` |
| 6 | Server sends `game_state` messages after `start_game` | API integration | `pong_server_sends_game_state` |
| 7 | Ball position changes between ticks after serve | API integration | `pong_ball_moves_after_serve` |
| 8 | Ball vy flips on top/bottom wall contact | API integration | `pong_ball_wall_bounce` |
| 9 | Ball speed increments on paddle contact | API integration | `pong_ball_speed_increments_on_hit` |
| 10 | AI paddle moves up when ball above paddle top | API integration | `pong_ai_moves_up_when_ball_above` |
| 11 | AI paddle stationary when ball within paddle bounds | API integration | `pong_ai_stationary_when_ball_covered` |
| 12 | Both paddles clamped to canvas bounds | API integration | `pong_paddles_clamped_to_bounds` |
| 13 | Point scored when ball exits left/right boundary | API integration | `pong_point_scored_on_exit` |
| 14 | Score incremented, serve countdown begins after point | API integration | `pong_score_and_serve_reset` |
| 15 | Ball launches toward player who just scored after countdown | API integration | `pong_serve_targets_scorer` |
| 16 | `flush_rally` stub called with correct args on point scored | API integration | `pong_flush_rally_stub_called` |
| 17 | Game ends with `game_over` when score reaches 7 | API integration | `pong_game_over_at_7` |
| 18 | WS closed with 1000 after `game_over` | API integration | `pong_connection_closed_on_game_over` |
| 19 | Keyboard up/down sends correct `action` over WS | E2E | `pong_keyboard_controls` |
| 20 | Gamepad press top half sends `action: up`; release sends `action: none` | E2E | `pong_gamepad_up` |
| 21 | Gamepad drag from bottom to top half sends `action: up` | E2E | `pong_gamepad_drag_switches_direction` |
| 22 | Canvas scales without overflow on 375px mobile viewport | E2E | `pong_canvas_mobile_scale` |
| 23 | Unauthenticated user sees login prompt, not game | E2E | `pong_auth_gate` |
| 24 | Disconnect mid-game shows correct UI and "Play Again" resets | E2E | `pong_disconnect_shows_reconnect_ui` |
| 25 | game_over overlay shows final score and "Play Again" button | E2E | `pong_game_over_overlay` |
| 26 | Disconnect mid-rally: verify buffer discarded, no DB write | manual | Kill network mid-rally; verify no partial entry in `pong_rallies` once schema exists |
| 27 | Landscape orientation on mobile: no horizontal overflow | manual | Rotate to landscape, verify canvas fits without scroll |
