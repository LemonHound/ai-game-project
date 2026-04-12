# Game: Connect 4

**Status: implemented**

## Background

Backend game logic exists in `src/backend/game_logic/connect4.py`. Legacy REST API endpoints exist at
`/api/game/connect4/start`, `/api/game/connect4/move`, `/api/game/connect4/ai-first`,
`/api/game/connect4/session/{id}`. These legacy endpoints are retired by this spec. The React page at
`src/frontend/src/pages/games/Connect4Page.tsx` is currently a stub. The game-data-persistence feature is
complete and integrated. This spec supersedes the Connect 4 section of the react-migration Phase 3 spec and
resolves all open questions from the previous version of this spec.

## Resolved Design Decisions

All decisions from `features/game-tic-tac-toe/spec.md` apply unless overridden here:

- **Auth required**: No unauthenticated gameplay. Game pages display a login prompt blocking the game UI.
  Any API call without a valid session returns 401; the client surfaces an `AuthModal`, no silent retry.
- **Transport**: Server-Sent Events for all server→client push. Client POSTs moves (202 Accepted, no state
  in response); state updates arrive over SSE.
- **One session per user per game**: Enforced by DB partial unique index. Starting a new game explicitly
  closes any existing active session before creating a new one.
- **No AI difficulty selection**: The difficulty parameter is not exposed to the user. The AI internally
  uses the existing medium-level heuristic (win/block/center/random). The `games` table `difficulty`
  column remains game-level metadata only.
- **Turn order**: Player selects Red (go first) or Yellow (go second) before the game starts. Internally
  stored and passed as `player_starts: bool`. If `player_starts` is false, the AI (Red) takes the first
  move before `/newgame` returns.
- **Color assignment**: `player_starts=true` → player is Red, AI is Yellow. `player_starts=false` →
  player is Yellow, AI is Red. The client derives display colors from `player_starts` in the state; the
  board stores `"player"` and `"ai"` as piece values.
- **Game ID ownership**: Client never stores the game `id` across page loads. Received from `/resume` or
  `/newgame`, used only to subscribe to SSE. Move requests carry no `id`.
- **Column selection**: The entire column is the clickable/tappable target. On hover or touch, the active
  column highlights and an arrow indicator appears above it. No separate drop-zone row needed.
- **Drop animation**: When a move event arrives (player or AI), the piece animates falling from the top of
  the column to its landing row (~200ms CSS transition). The board is locked during the animation.
- **Win highlight**: On terminal win, the 4 winning cells pulse with an outline or brightness increase; all
  other pieces dim to 40% opacity. On draw, no highlight.
- **Legacy endpoints retired**: `/api/game/connect4/start`, `/api/game/connect4/ai-first`,
  `/api/game/connect4/session/{id}`, and the generic `/api/game/connect4/move` (non-SSE) are removed.

## Architecture

### New: Connect4Engine (`game_engine/connect4_engine.py`)

Replaces the legacy `Connect4Game` class for all SSE-based game flow. Implements the `GameEngine` ABC
from `game_engine/base.py`.

```
validate_move(state, move: {"col": int}) → bool
    - col in range [0, 6]
    - state["game_active"] is True
    - state["current_turn"] == "player"
    - column not full (state["board"][0][col] is None)

apply_move(state, move: {"col": int}) → GameState
    - Drops piece for state["current_turn"] into the lowest empty row of col
    - Sets state["last_move"] = {"row": row, "col": col, "player": current_turn}
    - Toggles state["current_turn"]
    - Does NOT process the opponent's response (MoveProcessor handles sequencing)

is_terminal(state) → tuple[bool, outcome | None]
    - outcome: "player_won" | "ai_won" | "draw" | None
    - Uses state["last_move"] to anchor win detection (same direction-scan as _check_winner)
    - Draw: board full (move_count == 42) and no winner

get_legal_moves(state) → list[{"col": int}]
    - Returns all columns where state["board"][0][col] is None

get_winning_cells(state) → list[tuple[int, int]] | None
    - Called after is_terminal returns a win (not draw, not None)
    - Returns the 4 [row, col] pairs of the winning line
    - Anchored on state["last_move"]; returns None if no win present

initial_state(player_starts: bool) → GameState
```

**GameState shape:**
```json
{
  "board": [[null, ...], ...],
  "current_turn": "player" | "ai",
  "game_active": true,
  "move_count": 0,
  "player_starts": true,
  "last_move": null
}
```
Board is a 6-row × 7-col 2D array. Each cell: `null | "player" | "ai"`.

### Connect4AIStrategy (`game_engine/connect4_engine.py`)

Implements `AIStrategy`. Wraps the win/block/center/random heuristic from the existing
`Connect4Game._get_ai_move`. Returns `({"col": int}, None)` — this heuristic has no eval score.

### Shared Infrastructure (unchanged)

`MoveProcessor`, `StatusBroadcaster`, and `GameEngine`/`AIStrategy` ABCs from `game_engine/base.py` are
reused without modification. `StatusBroadcaster` timing is governed by `GAME_SERVER_MIN_EVENT_INTERVAL_MS`
— see `features/ai-delay-config/spec.md`.

### Legacy Generic Endpoints

`games.py` contains generic `POST /game/{game_id}/start` and `POST /game/{game_id}/move` endpoints that
use the old bundled `apply_move` architecture (player + AI in one call). These must return `501` for
`connect4` during implementation to prevent stale code paths from the pre-SSE architecture.

### SSE Event Schema

Status and heartbeat events are identical to TTT. Move events are Connect4-specific:

```json
{"type": "status", "message": "Thinking..."}

{"type": "move", "data": {
  "col": 3,
  "row": 4,
  "player": "player",
  "board": [[null, ...], ...],
  "player_starts": true,
  "current_turn": "ai",
  "status": "in_progress",
  "winner": null,
  "winning_cells": null
}}

{"type": "move", "data": {
  "col": 3,
  "row": 2,
  "player": "ai",
  "board": [[null, ...], ...],
  "player_starts": true,
  "current_turn": null,
  "status": "complete",
  "winner": "ai",
  "winning_cells": [[2, 3], [3, 3], [4, 3], [5, 3]]
}}

{"type": "heartbeat"}

{"type": "error", "code": "invalid_move", "message": "..."}
```

`winning_cells` is a list of `[row, col]` pairs (always exactly 4) for a win, `null` for draw or
in-progress. `winner` values: `"player" | "ai" | "draw" | null`.

### Status Copy

Identical to TTT:

| Condition | Message |
|---|---|
| AI begins processing | `"Thinking..."` |
| 2.5s pass, AI still running | random: `["Hmm...", "Considering the board...", "Plotting a move...", "Analyzing..."]` |
| 5s+ elapsed | random: `["Taking a moment...", "Almost there..."]` |
| AI move ready | `move` event (closes the turn) |

## API Endpoints

All endpoints require authentication. 401 for any unauthenticated request.

### `GET /api/game/connect4/resume`

Called on every page load. Returns the active session if one exists.

**Response 200 — active session:**
```json
{"id": "uuid", "state": { ...game state... }}
```

**Response 200 — no active session:**
```json
{"id": null, "state": null}
```

### `POST /api/game/connect4/newgame`

Closes any existing active session, creates a new one. If `player_starts` is false, the AI takes the
first move (as Red) before the response is returned.

**Request:**
```json
{"player_starts": true}
```

**Response 200:**
```json
{"id": "uuid", "state": { ...initial game state... }}
```

### `POST /api/game/connect4/move`

Submits the player's column choice. Active session derived server-side.

**Request:**
```json
{"col": 3}
```

**Response 202:** Empty body. State update delivered via SSE.

**Response 422:** Invalid move (col out of range, column full, not player's turn, game already over).

**Response 409:** No active session.

### `GET /api/game/connect4/events/{id}`

Persistent SSE stream. Authenticated user must own the session.

**Response:** `text/event-stream`

Cloud Run request timeout already raised to 3600s (from TTT). Heartbeat every 30s.

## Session Lifecycle and Timeout

Identical to TTT. Session timeout: 24 hours (same `session_timeout_hours` column on the `games` table
row for connect4). Cleanup via the existing `POST /internal/cleanup-sessions` endpoint.

## Observability

Follows the conventions in `features/observability/spec.md`.

**`games.py` (request layer):**
- `POST /newgame`, `POST /move`, `GET /resume`, `GET /events/{id}`: set `game.id` as an attribute
  on the auto-instrumented HTTP span via `span.set_attribute`.
- No new spans at this layer.

**`games.py` — AI move processing:**
- Child span `game.ai.move` on the SSE handler. Attributes: `game.id`, `compute_duration_ms`,
  `ai_invalid_move_count`.

**`persistence_service.py`:**
- Existing child spans for `record_move` and `end_session` already cover DB writes. No changes required.

**SSE connection lifecycle:**
- SSE open: `span.set_attribute("game.id", ...)`
- SSE close (normal): `logger.info("c4_sse_closed", extra={"game_id": game_id})`
- SSE close (error / unexpected): `logger.exception("c4_sse_error", extra={"game_id": game_id})` +
  `span.record_exception(e)` + `span.set_status(ERROR)`

**Invalid move logging:**
- `POST /move` returning 422: `logger.warning("c4_invalid_move", extra={"game_id": game_id, "move": move})`

**No instrumentation inside `game_engine/` files.** All manual instrumentation lives at the router and
persistence layers only.

## Client Behavior

### Page Load and Resume

Identical phase model as TTT: `loading → newgame → resumeprompt → playing → terminal`.

localStorage key: `c4_game_hint` (same shape and TTL as `ttt_game_hint`).

### Turn Order Selection

Overlay in `newgame` phase. Two buttons:
- "Play as Red — Go First"
- "Play as Yellow — Go Second"

Submitting triggers `POST /newgame` with `player_starts: true/false`. Board renders immediately in
`playing` phase (empty, locked). When going second, the AI (Red) computes its first move server-side
before `/newgame` returns; the board updates with that move and the drop animation plays on arrival.

### Move Submission and Loading State

1. Column tap → client validates locally (column not full, game active, player's turn) — UX only.
2. If valid: column highlight persists, board locks.
3. `POST /move` fires. On 202: SSE events drive status display.
4. SSE `status` events update the AI `PlayerCard` status text.
5. SSE `move` event for player's piece: drop animation plays, board updates.
6. SSE `move` event for AI's piece (same event or subsequent): drop animation plays, locks release if
   game continues.

Note: The player move and AI move each emit a separate `move` SSE event so the client can animate them
sequentially. The board locks until both animations complete.

### Column Interaction

- **Hover (desktop)**: column brightens, arrow indicator appears above the topmost empty cell.
- **Touch (mobile)**: tap commits immediately; no hover state.
- **Full column**: column header area is grayed and non-interactive; cursor changes to not-allowed.
- **Board locked**: no column interaction during AI turn or animation.

### Drop Animation

On receiving a `move` event, the piece renders at `row=0` and transitions to the landing `row` using a
CSS transform (`translateY`) over ~200ms with `ease-in` timing (heavier piece feel). The board locks
for the duration. If two sequential moves arrive (player then AI), animations play back-to-back.

### Outcome

Same as TTT: result displayed inside `PlayerCard` components (win/loss/draw badge). "New Game" button
below the player card enters `newgame` phase.

On win: `winning_cells` from the terminal move event drives the highlight. 4 cells get a pulsing ring or
brightness boost; all others dim to 40% opacity.

### SSE Reconnect and Error Path

Identical to TTT: `EventSource` reconnects automatically, calls `/resume`, re-renders board state.
401 from any game API → clear local game state, display `AuthModal`.

## UI / Layout

Layout (top to bottom): AI `PlayerCard` → board (with overlay) → player `PlayerCard` → "New Game"
button.

`PlayerCard` reused from TTT. AI card shows disc color badge (Red or Yellow) instead of X/O symbol;
Player card shows the player's disc color.

- **Board**: 6 rows × 7 cols grid. Each cell is a circle (disc slot). Empty slots are a muted ring.
  Filled slots are solid Red (`player` or `ai` depending on `player_starts`) or Yellow.
- **Column headers**: invisible tap targets spanning the full column height. On hover, the column
  background lightens and an arrow appears above the topmost empty cell.
- **Board overlays**: same `loading`, `resumeprompt`, `newgame` overlays as TTT (same positioning,
  backdrop blur).
- **Mobile (< 640px)**: board fills viewport width; each cell at minimum 40px for comfortable tap;
  no horizontal scroll; cards and controls stack above/below.
- **Desktop**: max-width `lg` container centred; same vertical stack.

## Data Persistence

Every valid move (player and AI) is recorded via `persistence_service.record_move()`. The
`move_notation` argument must be the column string for the move (e.g. `"c3"` for column 3).
Terminal state triggers `persistence_service.end_game()`. See the game-data-persistence spec for the
full function signatures.

**Notation conversion**: The engine owns the notation format. `Connect4Engine` exposes a
`to_notation(col: int) -> str` method that converts a column index to `"c{col}"` (e.g. `"c3"` for
column 3). The router calls `engine.to_notation(move["col"])` before passing the string to
`record_move`.

## Test Cases

### Unit

| Test name | Scenario |
|---|---|
| `test_c4_engine_validate_move_out_of_range` | validate_move returns false for col < 0 or > 6 |
| `test_c4_engine_validate_move_full_column` | validate_move returns false when column is full |
| `test_c4_engine_validate_move_wrong_turn` | validate_move returns false when it's AI's turn |
| `test_c4_engine_apply_move_lands_at_bottom` | piece lands in lowest empty row of column |
| `test_c4_engine_apply_move_stacks_pieces` | second piece in column lands above first |
| `test_c4_engine_apply_move_sets_last_move` | apply_move sets last_move in state |
| `test_c4_engine_apply_move_toggles_turn` | current_turn alternates after apply_move |
| `test_c4_engine_is_terminal_horizontal_win` | detects horizontal four-in-a-row |
| `test_c4_engine_is_terminal_vertical_win` | detects vertical four-in-a-row |
| `test_c4_engine_is_terminal_diagonal_win` | detects both diagonal directions |
| `test_c4_engine_is_terminal_draw` | full board with no winner returns draw |
| `test_c4_engine_is_terminal_in_progress` | non-terminal state returns (False, None) |
| `test_c4_engine_get_legal_moves_excludes_full_columns` | only non-full columns returned |
| `test_c4_engine_get_legal_moves_empty_board` | all 7 columns returned on empty board |
| `test_c4_engine_get_winning_cells_returns_four` | winning cells are exactly 4 for any win direction |
| `test_c4_engine_get_winning_cells_none_when_no_win` | returns None for non-terminal or draw state |
| `test_c4_ai_strategy_returns_valid_col` | AIStrategy.generate_move returns col within [0, 6] |
| `test_c4_ai_strategy_wins_if_available` | AI takes winning column if one exists |
| `test_c4_ai_strategy_blocks_player_win` | AI blocks player's winning column |
| `test_move_processor_ai_invalid_move_retries` | reused from TTT (no new test needed) |
| `test_move_processor_ai_fallback_after_max_retries` | reused from TTT (no new test needed) |

### API Integration

| Test name | Scenario |
|---|---|
| `test_c4_resume_no_active_session` | GET /resume returns {id: null, state: null} |
| `test_c4_resume_active_session_returns_state` | GET /resume returns current board state |
| `test_c4_resume_unauthenticated_returns_401` | GET /resume without auth |
| `test_c4_newgame_player_first` | POST /newgame player_starts=true → empty board, player's turn |
| `test_c4_newgame_ai_first` | POST /newgame player_starts=false → state reflects AI's first move (Red) |
| `test_c4_newgame_closes_existing_session` | POST /newgame closes old active session, creates new |
| `test_c4_move_returns_202` | POST /move returns 202, no state body |
| `test_c4_move_col_out_of_range_returns_422` | POST /move col < 0 or > 6 |
| `test_c4_move_full_column_returns_422` | POST /move to a column with no empty rows |
| `test_c4_move_no_active_session_returns_409` | POST /move with no session |
| `test_c4_move_unauthenticated_returns_401` | POST /move without auth |
| `test_c4_sse_delivers_status_then_move` | SSE delivers status event(s) then move event in order |
| `test_c4_sse_move_includes_winning_cells` | terminal win event includes exactly 4 winning_cells |
| `test_c4_sse_draw_has_null_winning_cells` | terminal draw event has winning_cells: null |
| `test_c4_sse_heartbeat_within_interval` | SSE sends heartbeat within 35s of idle |
| `test_c4_sse_unauthorized_session_returns_403` | GET /events/{id} for another user's session |
| `test_c4_sse_stream_closes_on_terminal_state` | SSE stream closes after game-over move event |
| `test_c4_sse_move_triggers_record_move` | SSE move event results in DB record_move call |
| `test_c4_cleanup_marks_stale_sessions_abandoned` | reuses shared cleanup mechanism |

### E2E

| Test name | Scenario |
|---|---|
| `test_c4_full_game_player_wins` | Player drops pieces to win; winning cells highlight, win badge appears |
| `test_c4_full_game_ai_wins` | AI wins; losing cells dim, AI win badge appears |
| `test_c4_full_game_draw` | Board fills with no winner; draw badge appears, no cells highlighted |
| `test_c4_resume_prompt_shown_for_in_progress_session` | resumeprompt overlay renders over dimmed board |
| `test_c4_resume_prompt_continue_starts_sse` | clicking Continue subscribes to SSE and enters playing |
| `test_c4_resume_prompt_new_game_shows_side_selector` | clicking New Game shows Red/Yellow overlay |
| `test_c4_go_second_board_renders_before_api_returns` | board renders empty+locked immediately when going second |
| `test_c4_go_second_ai_first_move_visible` | after newgame returns, AI's Red piece is shown in column |
| `test_c4_result_shown_in_player_cards` | win/loss/draw badge in both PlayerCards, not as standalone alert |
| `test_c4_new_game_abandons_in_progress_session` | "New Game" closes old session, starts fresh |
| `test_c4_unauthenticated_user_sees_login_prompt` | Auth gate shows centred sign-in card |
| `test_c4_resume_after_page_refresh` | Mid-game refresh restores board state |
| `test_c4_401_shows_auth_modal` | 401 from any game API triggers AuthModal |
| `test_c4_mobile_viewport_playable` | Board fully playable at 375px wide, no horizontal scroll |
| `test_c4_sse_reconnect_restores_state` | SSE disconnect + reconnect shows correct board |
| `test_c4_column_full_is_non_interactive` | Full column shows not-allowed cursor, tap is ignored |
| `test_c4_board_locked_during_ai_turn` | Columns non-interactive while AI is thinking |

### Manual

| Scenario |
|---|
| Drop animation plays smoothly at ~200ms; piece appears to fall with gravity (ease-in) |
| Sequential player + AI animations play back-to-back without flicker |
| Column hover highlights correctly and arrow points above topmost empty cell |
| Column full state is visually obvious (dimmed header, no hover response) |
| Winning cells pulse clearly; non-winning pieces dim noticeably |
| Status text ("Thinking...") appears inside the AI PlayerCard during AI turn |
| Board tap targets are comfortable on a physical mobile device (40px+ cells) |
| Landscape orientation on mobile renders without layout breakage or overflow |
| SSE reconnects and restores board correctly after simulated network drop |
| Resume prompt shows correct board state (dimmed) when returning to an in-progress game |
| Red and Yellow disc colors are visually distinct and accessible (sufficient contrast) |
