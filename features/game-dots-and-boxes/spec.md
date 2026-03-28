# Game: Dots and Boxes

**Status: ready**

## Background

Backend game logic is fully implemented in `src/backend/game_logic/dots_and_boxes.py`. Legacy REST API
routes exist at `/api/game/dots-and-boxes/start` and `/api/game/dots-and-boxes/move`; these are retired by
this spec and replaced with SSE-based endpoints matching the TTT architecture. The React page at
`src/frontend/src/pages/games/DotsAndBoxesPage.tsx` is currently a stub. The game-data-persistence feature
is complete and integrated. This spec supersedes the Dots and Boxes section of the react-migration Phase 3
spec and resolves the transport open question in `features/websocket/spec.md` for turn-based games: SSE,
not WebSocket.

## Resolved Design Decisions

- **Auth required**: No unauthenticated gameplay. Game pages display a login prompt blocking the game UI for
  unauthenticated users. Any API call without a valid session returns 401; the client surfaces an
  `AuthModal`, no silent retry.
- **Transport**: Server-Sent Events for all server→client push. Client POSTs moves (202 Accepted, no state
  in response); state updates arrive over SSE.
- **One session per user per game**: Enforced by existing DB partial unique index. Starting a new game
  explicitly closes any existing active session before creating a new one.
- **No AI difficulty selection**: The difficulty parameter is removed from the user-facing API. The `games`
  table retains its `difficulty` column as game-level metadata. This is unrelated to AI difficulty and must
  not be conflated.
- **Grid size**: Fixed at 4×4 (16 boxes, 40 lines). No user-selectable size.
- **Turn order**: Player selects whether to go first or second before the game starts. Internally stored and
  passed as `player_starts: bool`. If `player_starts` is false, the AI takes the first move before
  `/newgame` returns.
- **Session ID ownership**: The client never stores `session_id` across page loads. It is received from
  `/resume` or `/newgame` and used only to subscribe to the SSE stream. Move requests carry no `session_id`;
  the server derives the active session from the authenticated user + game type.
- **Rendering**: SVG. Dots are SVG circles; lines are SVG line elements; box fills are SVG rect elements
  rendered behind lines.
- **Interaction model**: Tap a line segment to draw it. Each undrawn line segment has a transparent SVG
  hit-target overlay (minimum 24px touch target). Desktop shows hover highlight on undrawn segments.
- **Score display**: Running score shown throughout the game in the PlayerCard components. Not deferred to
  end.
- **Extra-turn mechanic**: When a player (or AI) draws the line that completes one or more boxes, they score
  those boxes and take another turn immediately. Turn does not toggle in that case.
- **Legacy endpoints retired**: `/api/game/dots-and-boxes/start` and the old
  `/api/game/dots-and-boxes/move` (non-SSE) are removed. Additionally, the generic
  `POST /game/{game_id}/start` and `POST /game/{game_id}/move` endpoints in `games.py` use the old
  bundled architecture and must return `501` for `dots-and-boxes` to prevent stale code paths.

## Architecture

### Abstractions (shared across all turn-based games)

These live in `src/backend/game_engine/base.py` and are implemented per game.

**`GameEngine` (abstract base)**
```
validate_move(state, move) → bool
apply_move(state, move) → GameState
is_terminal(state) → tuple[bool, outcome | None]
get_legal_moves(state) → list[Move]
initial_state(player_starts: bool) → GameState
```

**`AIStrategy` (abstract base)**
```
generate_move(state) → tuple[Move, Optional[float]]
    # Move may be invalid; no guarantee. float is engine_eval or None if strategy has no score.
```

**`MoveProcessor` (shared, game-agnostic)**
```
process_player_move(engine, state, move) → GameState | ValidationError
process_ai_turn(engine, strategy, state, max_retries=5) → GameState
```
`process_ai_turn` loop:
1. `move = strategy.generate_move(state)`
2. If `engine.validate_move(state, move)`: break
3. `log.warning("ai_invalid_move", attempt=n)` + OTel attribute `ai_invalid_move_count`
4. After `max_retries` exhausted: `move = random.choice(engine.get_legal_moves(state))` (guaranteed valid)

**`StatusBroadcaster` (shared)**
```
emit(event: StatusEvent) → None     # called by game processor at full speed; non-blocking
stream() → AsyncGenerator[StatusEvent]  # drives the SSE endpoint; enforces min_interval
```
- `min_interval`: 2.5 seconds between sends to client
- First status held for ~0.5s (prevents flash for near-instant AI responses)
- Heartbeat event every 30s (client ignores; keeps stream alive through proxies)
- Terminal event closes the stream

### DaBEngine

Lives in `src/backend/game_engine/dab_engine.py`. Implements the `GameEngine` ABC.

**GameState shape:**
```json
{
  "grid_size": 4,
  "horizontal_lines": {},
  "vertical_lines": {},
  "boxes": {},
  "current_turn": "player" | "ai",
  "game_active": true,
  "player_starts": true,
  "player_score": 0,
  "ai_score": 0,
  "move_count": 0,
  "last_move": null | {
    "type": "horizontal" | "vertical",
    "row": 0,
    "col": 0,
    "boxes_completed": 0,
    "newly_claimed_boxes": [{"row": 0, "col": 0}]
  }
}
```

Lines are stored as dicts keyed by `"row,col"` → owner string (`"player"` or `"ai"`). Boxes are stored
the same way.

**Grid geometry (grid_size=4):**
- 5×5 dots (rows and cols 0–4)
- Horizontal lines: row ∈ [0,4], col ∈ [0,3] → 20 horizontal lines
- Vertical lines: row ∈ [0,3], col ∈ [0,4] → 20 vertical lines
- 40 total lines, 16 boxes
- Box `(row, col)` top-left corner: row, col ∈ [0,3]. Complete when
  `horizontal(row,col)`, `horizontal(row+1,col)`, `vertical(row,col)`, `vertical(row,col+1)` are all drawn.

**`DaBEngine.apply_move` behavior:**
- Draws exactly one line (does NOT process the opponent or loop on extra turns).
- Claims any newly completed boxes for the mover.
- Sets `last_move` with `boxes_completed` and `newly_claimed_boxes`.
- If `boxes_completed > 0`: `current_turn` stays the same player (extra turn).
- If `boxes_completed == 0`: `current_turn` toggles to the opponent.
- Updates `player_score` and `ai_score`.
- Sets `game_active = False` and `move_count` accordingly.

**`DaBEngine.is_terminal`:** Returns `True` when `player_score + ai_score == 16` (all boxes claimed).
There is no win condition mid-game; outcome is only determined when all boxes are filled.

**`DaBEngine.get_legal_moves`:** Returns all undrawn lines as
`[{"type": str, "row": int, "col": int}]`.

**`DaBEngine.initial_state`:** grid_size=4 fixed. `current_turn` set from `player_starts` param.

**`DaBEngine.get_winner(state)`:** Returns `"player"` | `"ai"` | `"draw"` based on scores. Only valid when
`is_terminal` is True.

**`validate_move(state, move)`:**
- `move["type"]` is `"horizontal"` or `"vertical"`.
- For horizontal: `row ∈ [0,4]`, `col ∈ [0,3]`; key not already in `horizontal_lines`.
- For vertical: `row ∈ [0,3]`, `col ∈ [0,4]`; key not already in `vertical_lines`.
- `state["current_turn"] == "player"` (server only accepts player moves via POST /move).
- `state["game_active"]` is True.

### DaBStrategy

Lives in `src/backend/game_engine/dab_engine.py`. Implements `AIStrategy`. Wraps the existing
`_get_ai_move` heuristic from `DotsAndBoxes`. Returns `({"type": str, "row": int, "col": int}, None)` — this heuristic has no eval score.

Heuristic priority:
1. Take any move that completes a box.
2. Take a "safe" move (does not give the opponent a box — no box with 2 sides becomes 3-sided).
3. Random legal move.

### SSE Event Schema

```json
{"type": "status", "message": "Thinking..."}

{"type": "move", "data": {
  "line_type": "horizontal",
  "row": 1,
  "col": 2,
  "player": "player",
  "boxes_completed": 1,
  "newly_claimed_boxes": [{"row": 1, "col": 2}],
  "horizontal_lines": {"1,2": "player"},
  "vertical_lines": {},
  "boxes": {"1,2": "player"},
  "player_starts": true,
  "current_turn": "player",
  "player_score": 2,
  "ai_score": 1,
  "status": "in_progress",
  "winner": null
}}

{"type": "move", "data": {
  "status": "complete",
  "winner": "ai",
  "player_score": 7,
  "ai_score": 9,
  "current_turn": null
}}

{"type": "heartbeat"}

{"type": "error", "code": "invalid_move", "message": "..."}
```

The `player` field in move events is `"player"` or `"ai"`. State uses `"player"`/`"ai"` throughout, not
`"X"`/`"O"`. The client maps to display colors.

### Status Copy

Dots and Boxes does not use `StatusBroadcaster`. The AI heuristic is near-instant and the chain
animation is the primary UX feedback. A single `"Thinking..."` status event is yielded directly before
the first AI move in a turn sequence; consecutive chain moves emit no status.

| Condition | Message |
|---|---|
| AI turn begins | `"Thinking..."` (direct yield, no rate-limiting) |
| AI move ready (first and subsequent chain moves) | `move` event (direct yield, 500ms between each) |

`StatusBroadcaster` is **not instantiated** for Dots and Boxes — the SSE handler yields all events
directly.

### Extra-Turn Loop in SSE Handler

After any move event is emitted, the handler checks the resulting state:

**Player extra turn:** If the move event has `current_turn == "player"` and `status == "in_progress"`,
the SSE handler does nothing further — the board unlocks and waits for the next player POST.

**AI extra-turn chain:** After an AI move is applied and emitted, if `current_turn == "ai"` and not
terminal, the handler immediately applies the next AI move, waits 500ms, then emits another move event.
This loop continues until `current_turn != "ai"` or the game is terminal. Each AI move in the chain is
a separate SSE move event. The 500ms delay allows the player to observe each line being drawn.

Pseudocode for the SSE handler's AI processing loop:

**Important:** `StatusBroadcaster` enforces a 2.5s `MIN_INTERVAL` on all events, including move events.
Routing AI chain moves through the broadcaster would space them 2.5s apart — far too slow for a
box-completing chain. Instead, chain move events are yielded **directly** to the SSE stream (bypassing
`StatusBroadcaster`) with a 500ms sleep between consecutive moves. `StatusBroadcaster` is not used for
Dots and Boxes at all; the SSE handler yields events directly.

```
# start of player-triggered AI turn
yield status_sse("Thinking...")       # simple direct yield, no broadcaster
await asyncio.sleep(0.5)              # brief pause before first AI move

while current_turn == "ai" and not terminal:
    move, _ = strategy.generate_move(state)
    state = engine.apply_move(state, move)
    persist move
    terminal, outcome = engine.is_terminal(state)
    yield move_event_sse_directly
    if current_turn == "ai" and not terminal:
        await asyncio.sleep(0.5)      # 500ms between chain moves

if terminal:
    persist end_session
    return  # stream generator ends naturally
```

## API Endpoints

All endpoints require authentication. 401 is returned for any unauthenticated request.

### `GET /api/game/dots-and-boxes/resume`

Always called on page load, regardless of how the user arrived. Returns the active session for the
authenticated user if one exists.

**Response 200 — active session:**
```json
{"session_id": "uuid", "state": { ...game state... }}
```

**Response 200 — no active session:**
```json
{"session_id": null, "state": null}
```
The client handles the null case by rendering the "New Game" UI. There is no 404 for this path — a missing
session is a normal state, not an error.

### `POST /api/game/dots-and-boxes/newgame`

Called only when the player explicitly chooses to start a new game. Closes any existing active session for
this user + game type, then creates a new one. If `player_starts` is false, the AI takes the first move
before the response is returned (the initial state reflects this first move).

**Request:**
```json
{"player_starts": true}
```

**Response 200:**
```json
{"session_id": "uuid", "state": { ...initial game state... }}
```

### `POST /api/game/dots-and-boxes/move`

Submits the player's move. Active session is derived server-side from the authenticated user + game type.
No `session_id` in request.

**Request:**
```json
{"type": "horizontal", "row": 1, "col": 2}
```

**Response 202:** Empty body. State update delivered via SSE.

**Response 422:** Invalid move (line already drawn, out of bounds, not player's turn, game already over).

**Response 409:** No active session.

### `GET /api/game/dots-and-boxes/events/{session_id}`

Persistent SSE stream. Authenticated user must own the session.

**Response:** `text/event-stream`

Cloud Run request timeout must be raised to 3600s. Heartbeat events every 30s prevent intermediate proxy
timeouts.

## Session Lifecycle and Timeout

A session remains active indefinitely as long as the player reconnects and resumes — there is no hard expiry
on active sessions from the player's perspective. Sessions abandoned without explicit closure must eventually
be cleaned up.

**Timeout configuration**: The `games` DB table has a `session_timeout_hours` column (integer, not null).
Dots and Boxes timeout: 24 hours. This value is the maximum idle time (measured from `last_move_at`) before
a session is marked abandoned.

**Cleanup mechanism**: A GCP Cloud Scheduler job fires periodically (e.g., every hour) and calls an
internal, non-public endpoint (`POST /internal/cleanup-sessions`). This endpoint queries all `in_progress`
sessions where `last_move_at < now() - session_timeout_hours` and marks them abandoned via
`end_game_session()`. The endpoint requires an internal-only auth header (not the user session cookie).

Sessions closed this way emit the `game.sessions.completed` metric with outcome `abandoned`, consistent
with the observability spec.

## Observability

Follows the conventions in `features/observability/spec.md`.

**`games.py` (request layer):**
- `POST /newgame`, `POST /move`, `GET /resume`, `GET /events/{session_id}`: set `game.id` and
  `game.session_id` as attributes on the auto-instrumented HTTP span via `span.set_attribute`.
- No new spans at this layer.

**`games.py` — AI move processing:**
- Child span `game.ai.move` on the SSE handler. Attributes: `game.id`, `compute_duration_ms`,
  `ai_invalid_move_count`.
- For AI extra-turn chains, each AI move within the chain records its own `game.ai.move` span.

**`persistence_service.py`:**
- Existing child spans for `record_move` and `end_session` already cover DB writes. No changes required.

**SSE connection lifecycle:**
- SSE open: `span.set_attribute("game.id", ...), span.set_attribute("game.session_id", ...)`
- SSE close (normal): `logger.info("dab_sse_closed", extra={"session_id": session_id})`
- SSE close (error / unexpected): `logger.exception("dab_sse_error", extra={"session_id": session_id})` +
  `span.record_exception(e)` + `span.set_status(ERROR)`
- Per-message spans: not required (too noisy).

**Invalid move logging:**
- `POST /move` returning 422: `logger.warning("dab_invalid_move", extra={"session_id": session_id, "move": move})`

**No instrumentation inside `game_engine/` files.** All manual instrumentation lives at the router and
persistence layers only.

## Client Behavior

### Page Load and Resume

The client uses five phases: `loading`, `newgame`, `resumeprompt`, `playing`, `terminal`.

1. Check `localStorage` for key `dab_game_hint`. If present and `expires` is in the future, enter `loading`
   phase (spinner overlay on board) while `/resume` is in flight. Otherwise enter `newgame` immediately.
2. On `/resume` response:
   - Active in-progress session → set board state from response, enter `resumeprompt` phase. SSE is **not**
     subscribed yet.
   - Completed session → set board state, enter `terminal` phase directly (no prompt needed).
   - Null → enter `newgame` phase, clear any stale localStorage hint.

**`dab_game_hint` shape:**
```json
{"expires": 1234567890000}
```
TTL: 10 minutes. Refreshed on every received SSE `move` event.

Cleared when:
- Terminal game state received over SSE.
- Player clicks "New Game" (before `/newgame` is even sent).
- `beforeunload` fires (handles normal tab/browser close; TTL handles crashes).

### Resume Prompt

When in `resumeprompt` phase, the board renders (dimmed, locked) with a centred overlay:

- **Continue Game** → subscribes to SSE, enters `playing` phase.
- **New Game** → enters `newgame` phase (overlay changes to turn-order selector; previous board stays
  visible dimmed underneath).

### Turn Order Selection

Shown as a board overlay in `newgame` phase. Two buttons: **"Go First"** / **"Go Second"**. Submitting
triggers `POST /newgame` with `player_starts: true/false`.

The board renders immediately in `playing` phase (empty, locked) before the API responds so the layout
does not shift. When going second (`player_starts=false`), the AI computes its first move server-side
before `/newgame` returns; the board updates with that move once the response arrives and SSE is
subscribed.

### Move Submission and Loading State

1. Line segment tap → client validates locally (line not already drawn, game active, player's turn) — UX
   layer only.
2. If valid: line visually commits (drawn in player color), board locks.
3. `POST /move` fires with `{"type": ..., "row": ..., "col": ...}`. On 202: SSE events drive status display.
4. SSE `status` events update the AI `PlayerCard` status text ("Thinking...", etc.).
5. SSE `move` event: board updates with AI move(s), locks release if game continues with player's turn.

### Extra-Turn Handling

**Player extra turn:** When the client receives a `move` event with `current_turn == "player"` and
`status == "in_progress"`, the board unlocks immediately. No prompt is shown; the player simply goes again.
The score in the player's `PlayerCard` updates to reflect the newly claimed box(es).

**AI extra-turn chain:** When the client receives a `move` event with `player == "ai"` and
`current_turn == "ai"`, another AI move event is expected imminently (after the server's 500ms delay).
The board remains locked. Each AI move event draws the new line and updates the score. The sequence ends
when a move event arrives with `current_turn == "player"` or `status == "complete"`.

### Outcome

Game result is displayed inside the `PlayerCard` components (above and below the board), not as a
standalone banner. Final scores are shown in each card. A "New Game" button appears below the player card;
clicking it enters `newgame` phase (overlay on dimmed board).

### SSE Reconnect and Error Path

Browser `EventSource` reconnects automatically on disconnect. On reconnect:
1. Call `/resume`.
2. If active session: re-render board from returned state, resubscribe to SSE.
3. If null session (stream was closed because game ended, or session timed out): render "New Game" UI,
   clear localStorage hint.

On any 401 from any game API: clear local game state, display `AuthModal`. No silent retry.

## UI / Layout

Layout (top to bottom): AI `PlayerCard` → board (with overlay) → player `PlayerCard` → "New Game" button.

The `PlayerCard` component (`src/frontend/src/components/PlayerCard.tsx`) is used for both participants.
See `features/player-card/spec.md` for the full component spec.

- AI card (above board): bot icon avatar, "AI Opponent" label, SSE status text during AI turn ("Thinking..."
  etc.), result badge on terminal state, running score in status area ("Score: 4").
- Player card (below board): user avatar / initials, display name, result badge on terminal state, running
  score in status area ("Score: 5").

### SVG Board

The board is a single React SVG component (`DotsAndBoxesBoard.tsx`). At grid_size=4 there are 5×5 dots,
20 horizontal lines, 20 vertical lines, and 16 box fill areas.

**Dots:** SVG `<circle>` elements at each intersection. Same color for all (e.g., neutral-content).

**Box fills:** SVG `<rect>` elements rendered behind lines. Each box fill covers the interior of one cell.
Opacity 40%.
- Player-claimed box: blue fill (`#3B82F6`, 40% opacity).
- AI-claimed box: red fill (`#EF4444`, 40% opacity).
- Unclaimed box: no fill.

**Lines (drawn):**
- Player lines: solid blue (`#3B82F6`).
- AI lines: solid red (`#EF4444`).

**Lines (undrawn):**
- Rendered as faint dashed gray to indicate possible moves.

**Hit targets:** Each undrawn line segment has a transparent SVG `<rect>` or `<line>` overlay with a
minimum 24px touch target dimension so it is easily tappable on mobile. Only undrawn lines are interactive;
drawn lines have no hit target.

**Hover state (desktop only):** On `mouseenter`, an undrawn line highlights to a more prominent color (e.g.,
blue-300 for player's turn) to indicate it is interactive. Removed on `mouseleave` or after click.

**Board overlays** (positioned absolute, `inset-0`, `bg-base-100/80 backdrop-blur-sm`):
- `loading`: centred spinner.
- `resumeprompt`: "Game in progress" label + Continue / New Game buttons.
- `newgame`: "Choose your turn:" label + Go First / Go Second buttons.

**Mobile (< 640px):** Board fills viewport width; dots and lines scale to fill the space; hit targets remain
≥ 24px; cards and controls stack above/below the board; no horizontal scroll.

**Desktop:** max-width `lg` container centred; same vertical stack.

All screen sizes and orientations supported without layout breakage.

## Data Persistence

Every valid move (player and AI) is recorded via `persistence_service.record_move()`. The `player`
argument must be `"human"` for player moves and `"ai"` for AI moves — consistent with TTT and the
existing DB data. `engine_eval` is stored as `null` (the heuristic strategy does not produce a numeric
score). Terminal state triggers `persistence_service.end_game_session()`. No changes to the persistence
service API are required.

## Test Cases

### Unit

| Test name | Scenario |
|---|---|
| `test_dab_engine_validate_move_line_already_drawn` | validate_move returns False when line key already in lines dict |
| `test_dab_engine_validate_move_out_of_bounds_horizontal` | validate_move returns False for horizontal row > 4 or col > 3 |
| `test_dab_engine_validate_move_out_of_bounds_vertical` | validate_move returns False for vertical row > 3 or col > 4 |
| `test_dab_engine_validate_move_valid_horizontal` | validate_move returns True for valid undrawn horizontal line |
| `test_dab_engine_validate_move_valid_vertical` | validate_move returns True for valid undrawn vertical line |
| `test_dab_engine_apply_move_no_box_turn_toggles` | drawing a line that completes no box switches current_turn to opponent |
| `test_dab_engine_apply_move_one_box_turn_stays` | drawing the completing line of one box keeps current_turn the same |
| `test_dab_engine_apply_move_two_boxes_one_line` | single line completing two boxes: both claimed, current_turn stays same |
| `test_dab_engine_apply_move_score_increments` | player_score and ai_score update correctly after box claims |
| `test_dab_engine_apply_move_last_move_set` | last_move reflects type, row, col, boxes_completed, newly_claimed_boxes |
| `test_dab_engine_is_terminal_all_boxes_claimed` | is_terminal returns True when player_score + ai_score == 16 |
| `test_dab_engine_is_terminal_fifteen_boxes` | is_terminal returns False when 15 boxes claimed |
| `test_dab_engine_get_legal_moves_count_at_start` | get_legal_moves returns 40 moves on empty board |
| `test_dab_engine_get_legal_moves_decreases_as_lines_drawn` | count decreases by 1 for each line drawn |
| `test_dab_engine_get_winner_player_more_boxes` | get_winner returns "player" when player_score > ai_score |
| `test_dab_engine_get_winner_ai_more_boxes` | get_winner returns "ai" when ai_score > player_score |
| `test_dab_engine_get_winner_equal_boxes_draw` | get_winner returns "draw" when scores are equal |
| `test_move_processor_ai_invalid_move_retries` | processor retries on invalid AI move, logs warning |
| `test_move_processor_ai_fallback_after_max_retries` | processor falls back to random valid move |
| `test_move_processor_player_invalid_move_returns_error` | player validation rejects bad input |
| `test_status_broadcaster_enforces_min_interval` | broadcaster holds events to min_interval |
| `test_status_broadcaster_closes_on_terminal_event` | stream terminates after terminal event |
| `test_status_broadcaster_emits_heartbeat` | heartbeat event emitted at configured interval |

### API Integration

| Test name | Scenario |
|---|---|
| `test_dab_resume_no_active_session` | GET /resume returns {session_id: null, state: null} |
| `test_dab_resume_active_session_returns_state` | GET /resume returns current board state |
| `test_dab_resume_unauthenticated_returns_401` | GET /resume without auth |
| `test_dab_newgame_player_first` | POST /newgame player_starts=true → empty board, current_turn="player" |
| `test_dab_newgame_ai_first` | POST /newgame player_starts=false → state reflects AI's first move before response |
| `test_dab_newgame_closes_existing_session` | POST /newgame closes old active session, creates new one |
| `test_dab_move_returns_202` | POST /move returns 202, no state body |
| `test_dab_move_line_already_drawn_returns_422` | POST /move for a line that is already drawn |
| `test_dab_move_invalid_type_returns_422` | POST /move with type not "horizontal" or "vertical" |
| `test_dab_move_out_of_bounds_returns_422` | POST /move with row/col outside valid range |
| `test_dab_move_no_active_session_returns_409` | POST /move with no active session |
| `test_dab_move_unauthenticated_returns_401` | POST /move without auth |
| `test_dab_sse_move_event_has_boxes_completed` | SSE move event includes correct boxes_completed count |
| `test_dab_sse_move_event_has_newly_claimed_boxes` | SSE move event includes newly_claimed_boxes list |
| `test_dab_sse_player_completes_box_extra_turn` | After player completes a box, next SSE move event has current_turn="player" |
| `test_dab_sse_ai_extra_turn_chain` | AI completing boxes produces multiple consecutive AI move events with 500ms spacing |
| `test_dab_sse_heartbeat_within_interval` | SSE sends heartbeat within 35s of idle |
| `test_dab_sse_unauthorized_session_returns_403` | GET /events/{id} for another user's session |
| `test_dab_sse_stream_closes_on_terminal_state` | SSE stream closes after game-over move event |

### E2E

| Test name | Scenario |
|---|---|
| `test_dab_full_game_player_wins` | Player claims more boxes; player win result shown in PlayerCards |
| `test_dab_full_game_ai_wins` | AI claims more boxes; AI win result shown in PlayerCards |
| `test_dab_full_game_draw` | Both players claim 8 boxes; draw result shown in PlayerCards |
| `test_dab_player_extra_turn` | Player completes a box; player goes again without an AI move in between |
| `test_dab_ai_box_completing_chain` | AI completes 3+ boxes consecutively; each move visible with ~500ms delay |
| `test_dab_resume_prompt_shown_for_in_progress_session` | resumeprompt overlay renders over dimmed board when active session found |
| `test_dab_resume_prompt_continue_starts_sse` | clicking Continue from resumeprompt subscribes to SSE and enters playing |
| `test_dab_resume_prompt_new_game_shows_turn_selector` | clicking New Game from resumeprompt shows Go First / Go Second overlay |
| `test_dab_go_second_ai_moves_before_response` | when going second, AI first move is reflected in initial state |
| `test_dab_result_shown_in_player_cards` | win/loss/draw badge and final score appear in both PlayerCards |
| `test_dab_running_score_visible_during_game` | score in PlayerCards updates after each box is claimed |
| `test_dab_new_game_abandons_in_progress_session` | "New Game" closes old session, starts fresh |
| `test_dab_unauthenticated_user_sees_login_prompt` | Auth gate shows centred sign-in card |
| `test_dab_resume_after_page_refresh` | Mid-game refresh restores board state and all drawn lines |
| `test_dab_401_shows_auth_modal` | 401 from any game API triggers AuthModal |
| `test_dab_mobile_viewport_playable` | Board fully playable at 375px wide; line tap targets ≥ 24px |

### Manual

| Scenario |
|---|
| Line segments are clearly tappable on mobile without mis-tapping adjacent lines |
| Hover state on desktop highlights the hovered line segment before clicking |
| Box fill appears immediately on claim (no animation required, but must be instant) |
| AI box-completing chain has ~500ms delay between each move — pace is readable, not too fast |
| Score in PlayerCards updates in real time on each box claim |
| Drawn lines for player vs AI are visually distinct (blue vs red) |
| Landscape orientation renders without overflow on mobile |
| Status text ("Thinking...") appears in the AI card, not below the board |
| Resume prompt shows correct board state (dimmed) when returning to an in-progress game |
| SSE reconnects and restores board correctly after simulated network drop |
