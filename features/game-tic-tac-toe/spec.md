# Game: Tic-Tac-Toe

**Status: ready**

## Background

Backend game logic exists in `src/backend/game_logic/tic_tac_toe.py`. REST API routes exist in
`src/backend/games.py`. The React page at `src/frontend/src/pages/games/TicTacToePage.tsx` is currently a
stub. The game-data-persistence feature is complete and integrated. This spec supersedes the Tic-Tac-Toe
section of the react-migration Phase 3 spec and resolves the transport open question in
`features/websocket/spec.md` for turn-based games: SSE, not WebSocket.

## Resolved Design Decisions

- **Auth required**: No unauthenticated gameplay. Game pages display a login prompt blocking the game UI for
  unauthenticated users. Any API call without a valid session returns 401; the client surfaces an
  `AuthModal`, no silent retry.
- **Transport**: Server-Sent Events for all server→client push. Client POSTs moves (202 Accepted, no state
  in response); state updates arrive over SSE.
- **One session per user per game**: Enforced by existing DB partial unique index. Starting a new game
  explicitly closes any existing active session before creating a new one.
- **No AI difficulty**: The AI difficulty parameter is removed entirely from the stack. The `games` table
  retains its `difficulty` column as game-level metadata (indicating how hard the game is for humans — TTT
  is low, Chess is high). This is unrelated to AI difficulty and must not be conflated.
- **Turn order**: Player selects whether to go first or second before the game starts. Internally this is
  stored and passed as `player_starts: bool`, matching the DB boolean convention. If `player_starts` is
  false, the AI takes the first move before `/newgame` returns.
- **Game ID ownership**: The client never stores the game `id` across page loads. It is received from
  `/resume` or `/newgame` and used only to subscribe to the SSE stream. Move requests carry no `id`;
  the server derives the active game from the authenticated user + game type.

## Architecture

### Abstractions (shared across all turn-based games)

These live in a shared module (e.g., `src/backend/game_engine/base.py`) and are implemented per game.

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
generate_move(state) → Move  # may be invalid; no guarantee
```
TTT implementation: wrap the existing minimax logic extracted from `TicTacToe` class.

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

### SSE Event Schema

```json
{"type": "status", "message": "Thinking..."}

{"type": "move", "data": {
  "position": 4, "player_starts": true,
  "board": ["X", null, "O", null, "O", null, null, null, "X"],
  "current_turn": "player",
  "status": "in_progress",
  "winner": null,
  "winning_positions": null
}}

{"type": "move", "data": {
  "status": "complete", "winner": "ai", "winning_positions": [2, 4, 6]
}}

{"type": "heartbeat"}

{"type": "error", "code": "invalid_move", "message": "..."}
```

### Status Copy

Player move validation produces no status event — the client already reflects the move visually and
validation is near-instant.

| Condition | Message |
|---|---|
| AI begins processing | `"Thinking..."` |
| 2.5s pass, AI still running | random: `["Hmm...", "Considering the board...", "Plotting a move...", "Analyzing..."]` |
| 5s+ elapsed | random: `["Taking a moment...", "Almost there..."]` |
| AI move ready | `move` event (closes the turn) |

## API Endpoints

All endpoints require authentication. 401 is returned for any unauthenticated request.

### `GET /api/game/tic-tac-toe/resume`

Always called on page load, regardless of how the user arrived. Returns the active session for the
authenticated user if one exists.

**Response 200 — active session:**
```json
{"id": "uuid", "state": { ...game state... }}
```

**Response 200 — no active session:**
```json
{"id": null, "state": null}
```
The client handles the null case by rendering the "New Game" UI. There is no 404 for this path — a missing
session is a normal state, not an error.

### `POST /api/game/tic-tac-toe/newgame`

Called only when the player explicitly chooses to start a new game. Closes any existing active session for
this user + game type, then creates a new one. If `player_starts` is false, the AI takes the first move
before the response is returned (the initial state reflects this).

**Request:**
```json
{"player_starts": true}
```

**Response 200:**
```json
{"id": "uuid", "state": { ...initial game state... }}
```

### `POST /api/game/tic-tac-toe/move`

Submits the player's move. Active session is derived server-side from the authenticated user + game type.
No session_id in request.

**Request:**
```json
{"position": 4}
```

**Response 202:** Empty body. State update delivered via SSE.

**Response 422:** Invalid move (cell occupied, out of range, not player's turn, game already over).

**Response 409:** No active session.

### `GET /api/game/tic-tac-toe/events/{id}`

Persistent SSE stream. Authenticated user must own the session.

**Response:** `text/event-stream`

Cloud Run request timeout must be raised to 3600s. Heartbeat events every 30s prevent intermediate proxy
timeouts.

## Session Lifecycle and Timeout

A session remains active indefinitely as long as the player reconnects and resumes — there is no hard
expiry on active sessions from the player's perspective. However, sessions abandoned without explicit
closure (player closes the browser, navigates away, crashes) must eventually be cleaned up.

**Timeout configuration**: The `games` DB table gains a `session_timeout_hours` column (integer, not null).
Each game defines its own timeout. TTT: 24 hours. This value is the maximum idle time (measured from
`last_move_at`) before a session is marked abandoned.

**Cleanup mechanism**: A GCP Cloud Scheduler job fires periodically (e.g., every hour) and calls an
internal, non-public endpoint (e.g., `POST /internal/cleanup-sessions`). This endpoint queries all
`in_progress` sessions where `last_move_at < now() - session_timeout_hours` and marks them abandoned via
`end_game()`. The endpoint requires an internal-only auth header (not the user session cookie).

Sessions closed this way emit the `game.sessions.completed` metric with outcome `abandoned`, consistent
with the observability spec.

## Observability

Follows the conventions in `features/observability/spec.md`.

**`games.py` (request layer):**
- `POST /newgame`, `POST /move`, `GET /resume`, `GET /events/{id}`: set `game.id` as an attribute
  on the auto-instrumented HTTP span via `span.set_attribute`.
- No new spans at this layer.

**`games.py` — AI move processing:**
- Child span `game.ai.move` on the SSE handler (not the POST /move handler — AI processing occurs in
  the SSE pipeline). Attributes: `game.id`, `compute_duration_ms`, `ai_invalid_move_count`.

**`persistence_service.py`:**
- Existing child spans for `record_move` and `end_session` already cover DB writes. No changes required.

**SSE connection lifecycle:**
- SSE open: `span.set_attribute("game.id", ...)`
- SSE close (normal): log at INFO level, no span event needed.
- SSE close (error / unexpected): `span.record_exception(e)` + `span.set_status(ERROR)`.
- Per-message spans: not required (too noisy). The `game.ai.move` child span covers the significant event.

**No instrumentation inside `game_engine/` files.** All manual instrumentation lives at the router and
persistence layers only.

## Client Behavior

### Page Load and Resume

The client uses five phases: `loading`, `newgame`, `resumeprompt`, `playing`, `terminal`.

1. Check `localStorage` for key `ttt_game_hint`. If present and `expires` is in the future, enter
   `loading` phase (spinner overlay on board) while `/resume` is in flight. Otherwise enter `newgame`
   immediately.
2. On `/resume` response:
   - Active in-progress session → set board state from response, enter `resumeprompt` phase. SSE is
     **not** subscribed yet.
   - Completed session → set board state, enter `terminal` phase directly (no prompt needed).
   - Null → enter `newgame` phase, clear any stale localStorage hint.

**`ttt_game_hint` shape:**
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

Shown as a board overlay in `newgame` phase. Two buttons: "Play as X — Go First" / "Play as O — Go
Second". Submitting triggers `POST /newgame` with `player_starts: true/false`.

The board renders immediately in `playing` phase (empty, locked) before the API responds so the layout
does not shift. When going second, the AI computes its first move server-side before `/newgame` returns;
the board updates with that move once the response arrives.

### Move Submission and Loading State

1. Cell click → client validates locally (cell empty, game active, player's turn) — UX layer only.
2. If valid: cell visually commits, board locks.
3. `POST /move` fires. On 202: SSE events drive status display.
4. SSE `status` events update the AI `PlayerCard` status text ("Thinking...", etc.).
5. SSE `move` event: board updates with AI move, locks release if game continues.

### Outcome

Game result is displayed inside the `PlayerCard` components (above and below the board), not as a
standalone banner. A "New Game" button appears below the player card; clicking it enters `newgame`
phase (overlay on dimmed board).

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

- AI card (above board): bot icon avatar, "AI Opponent" label, game symbol, SSE status text during AI
  turn, result badge on terminal state.
- Player card (below board): user avatar / initials, display name, game symbol, result badge on terminal
  state.
- Board overlays (positioned absolute, `inset-0`, `bg-base-100/80 backdrop-blur-sm`):
  - `loading`: centred spinner.
  - `resumeprompt`: "Game in progress" label + Continue / New Game buttons.
  - `newgame`: "Choose your side:" label + Go First / Go Second buttons.
- **Mobile (< 640px)**: board fills viewport width; cells at least 64px for comfortable tap targets; cards
  and controls stack above/below the board; no horizontal scroll.
- **Desktop**: max-width `lg` container centred; same vertical stack.
- All screen sizes and orientations supported without layout breakage.

## Data Persistence

Every valid move (player and AI) is recorded via `persistence_service.record_move()`. The
`move_notation` argument must be the cell string for the move (e.g. `"r1c2"` for row 1, col 2).
Terminal state triggers `persistence_service.end_game()`. See the game-data-persistence spec for the
full function signatures.

**Notation conversion**: The engine owns the notation format. `TicTacToeEngine` exposes a
`to_notation(position: int) -> str` method that converts a board position (0–8) to `"r{row}c{col}"`.
The router calls `engine.to_notation(move["position"])` before passing the string to `record_move`.

## Test Cases

### Unit

| Test name | Scenario |
|---|---|
| `test_ttt_engine_validate_move_occupied_cell` | validate_move returns false for occupied cell |
| `test_ttt_engine_validate_move_out_of_range` | validate_move returns false for position < 0 or > 8 |
| `test_ttt_engine_is_terminal_detects_all_win_lines` | is_terminal detects all 8 winning combinations |
| `test_ttt_engine_is_terminal_draw` | is_terminal detects full board, no winner |
| `test_ttt_engine_get_legal_moves_returns_empty_cells_only` | get_legal_moves correctness |
| `test_ttt_engine_apply_move_updates_board` | board state mutation and symbol assignment |
| `test_move_processor_ai_invalid_move_retries` | processor retries on invalid AI move, logs warning |
| `test_move_processor_ai_fallback_after_max_retries` | processor falls back to random valid move |
| `test_move_processor_player_invalid_move_returns_error` | player validation rejects bad input |
| `test_status_broadcaster_enforces_min_interval` | broadcaster holds events to min_interval |
| `test_status_broadcaster_closes_on_terminal_event` | stream terminates after terminal event |
| `test_status_broadcaster_emits_heartbeat` | heartbeat event emitted at configured interval |
| `test_minimax_returns_valid_move` | minimax returns a legal move for any non-terminal board state |

### API Integration

| Test name | Scenario |
|---|---|
| `test_resume_no_active_session` | GET /resume returns {id: null, state: null} |
| `test_resume_active_session_returns_state` | GET /resume returns current board state |
| `test_resume_unauthenticated_returns_401` | GET /resume without auth |
| `test_newgame_player_first` | POST /newgame player_starts=true → empty board, player's turn |
| `test_newgame_ai_first` | POST /newgame player_starts=false → state reflects AI's first move |
| `test_newgame_closes_existing_session` | POST /newgame closes old active session, creates new |
| `test_move_returns_202` | POST /move returns 202, no state body |
| `test_move_occupied_cell_returns_422` | POST /move to occupied cell |
| `test_move_out_of_range_returns_422` | POST /move position outside 0-8 |
| `test_move_no_active_session_returns_409` | POST /move with no session |
| `test_move_unauthenticated_returns_401` | POST /move without auth |
| `test_sse_delivers_status_then_move` | SSE delivers status event(s) then move event in order |
| `test_sse_heartbeat_within_interval` | SSE sends heartbeat within 35s of idle |
| `test_sse_unauthorized_session_returns_403` | GET /events/{id} for another user's session |
| `test_sse_stream_closes_on_terminal_state` | SSE stream closes after game-over move event |
| `test_sse_move_triggers_record_move` | SSE move event results in DB record_move call |
| `test_cleanup_marks_stale_sessions_abandoned` | Cleanup endpoint marks sessions past timeout |

### E2E

| Test name | Scenario |
|---|---|
| `test_ttt_full_game_player_wins` | Player plays to win; board updates, win banner appears |
| `test_ttt_full_game_ai_wins` | AI wins; loss banner appears |
| `test_ttt_full_game_draw` | Game ends in draw; draw banner appears |
| `test_ttt_resume_prompt_shown_for_in_progress_session` | resumeprompt overlay renders over dimmed board when active session found |
| `test_ttt_resume_prompt_continue_starts_sse` | clicking Continue from resumeprompt subscribes to SSE and enters playing |
| `test_ttt_resume_prompt_new_game_shows_side_selector` | clicking New Game from resumeprompt shows turn-order overlay |
| `test_ttt_go_second_board_renders_before_api_returns` | board renders empty+locked immediately when going second |
| `test_ttt_result_shown_in_player_cards` | win/loss/draw badge appears in both PlayerCards, not as standalone alert |
| `test_ttt_new_game_abandons_in_progress_session` | "New Game" closes old session, starts fresh |
| `test_ttt_unauthenticated_user_sees_login_prompt` | Auth gate shows centred sign-in card |
| `test_ttt_resume_after_page_refresh` | Mid-game refresh restores board state |
| `test_ttt_401_shows_auth_modal` | 401 from any game API triggers AuthModal |
| `test_ttt_mobile_viewport_playable` | Board fully playable at 375px wide |
| `test_ttt_sse_reconnect_restores_state` | SSE disconnect + reconnect shows correct board |
| `test_ttt_sse_reconnect_after_game_ends` | Reconnect to closed stream renders new game UI |

### Manual

| Scenario |
|---|
| Status text changes are readable at 2–3s intervals — not flickering, not stale |
| Loading skeleton renders before /resume resolves when localStorage hint is present |
| Board tap targets are comfortable on a physical mobile device |
| Landscape orientation on mobile renders without layout breakage |
| SSE reconnects and restores board correctly after simulated network drop |
| AI "Thinking..." text appears inside the AI card (not below the board) during AI turn |
| Resume prompt shows correct board state (dimmed) when returning to an in-progress game |
