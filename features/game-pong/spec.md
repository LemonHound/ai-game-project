# Game: Pong

**Status: blocked — depends on websocket**

## Background

Unlike the other games, Pong has no backend implementation. The existing `src/frontend/public/js/pong.js` is
entirely client-side — a canvas-based game loop using `requestAnimationFrame`. The game will require a backend
AI opponent that reacts to the ball state in real time, necessitating continuous bidirectional communication.
This is the most architecturally complex game in the set.

The React page at `src/frontend/src/pages/games/PongPage.tsx` is currently a stub.

This spec is intentionally incomplete — it depends on the websocket feature spec being finalized first, since
Pong's architecture is meaningfully different from the turn-based games.

## Known Requirements

- **Mobile + desktop responsive**: canvas must scale to viewport width without overflow; paddle control must
  work via keyboard on desktop and touch/swipe on mobile; the game board must be the primary focus above the
  fold
- Requires real-time bidirectional communication between client and server — this game is the primary driver
  for the WebSocket feature; Pong's continuous game loop cannot use REST and will use WebSocket exclusively
- **Backend AI validation**: backend validates AI paddle output; if invalid or out-of-bounds, corrects before
  sending to client — retry model may differ from turn-based games given real-time constraints (open question)
- React canvas rendering must use `useEffect` with proper cleanup to avoid memory leaks in React strict mode
  (the existing `requestAnimationFrame` loop must be managed carefully)
- When the game-data-persistence feature is complete, session data capture must be integrated

## Open Questions

### Architecture
- Server-authoritative vs. client-authoritative game state? (Who owns the ball position?)
- What is the server responsible for: AI paddle logic only, or full physics simulation?
- Tick rate / frame rate for WebSocket messages — how frequently does state sync between client and server?
- How does the game loop interact with WebSocket message latency?

### AI / ML Model
- What algorithm drives the AI paddle? (Trained ML model, rule-based, or heuristic?)
- Does the AI difficulty affect paddle speed, reaction time, or prediction accuracy?
- Is the ML model embedded in the backend Python code, or called as a separate service?

### Mobile Controls
- Touch controls: swipe to move paddle, or tap-and-hold on a side of the screen?
- Should there be on-screen paddle drag controls as an explicit UI element?
- Landscape orientation handling?

### Gameplay
- Should unauthenticated users be able to play?
- Winning condition: first to N points? Time limit? Configurable?
- Session recovery on disconnect (given the real-time nature, likely not feasible — confirm)?

### Stats & Persistence
- What game events are most meaningful for Pong? (Rally length? Reaction time? Score over time?)

## Test Cases

_To be defined once WebSocket spec and open questions above are resolved._

| # | Scenario | Tier | Test Name |
|---|----------|------|-----------|
| 1 | Canvas renders and scales to viewport width | unit | `pong_canvas_scales_to_viewport` |
| 2 | WebSocket connection established on game start | API integration | `pong_ws_connects_on_start` |
| 3 | AI paddle moves in response to ball position | API integration | `pong_ai_paddle_responds_to_ball` |
| 4 | Invalid AI paddle position corrected by backend | API integration | `pong_invalid_paddle_clamped` |
| 5 | Game ends and score reported on win condition | API integration | `pong_game_over_reports_score` |
| 6 | Touch/swipe controls move paddle on mobile | E2E | `pong_mobile_touch_controls` |
| 7 | Keyboard controls move paddle on desktop | E2E | `pong_keyboard_controls` |
| 8 | Disconnect during game resets to new game | manual | Disconnect mid-game, verify new game starts cleanly |
