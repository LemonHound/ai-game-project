# Game: Checkers

**Status: ready**

## Background

Backend game logic is fully implemented in `src/backend/game_logic/checkers.py`, including king promotion,
mandatory capture enforcement, and multi-jump chain generation. REST API stubs exist at
`/api/game/checkers/start` and `/api/game/checkers/move` but are incompatible with the SSE architecture and
will be retired. The React page at `src/frontend/src/pages/games/CheckersPage.tsx` is currently a stub.
The game-data-persistence feature is complete and integrated. This spec supersedes the Checkers section of
the react-migration Phase 3 spec and the open questions in the previous `features/game-checkers/spec.md`.
Transport is resolved: SSE, not WebSocket.

## Resolved Design Decisions

- **Auth required**: No unauthenticated gameplay. Game pages display a login prompt blocking the game UI for
  unauthenticated users. Any API call without a valid session returns 401; the client surfaces an
  `AuthModal`, no silent retry.
- **Transport**: Server-Sent Events for all server→client push. Client POSTs moves (202 Accepted, no state
  in response); state updates arrive over SSE.
- **One session per user per game**: Enforced by existing DB partial unique index. Starting a new game
  explicitly closes any existing active session before creating a new one.
- **No AI difficulty selection**: The AI difficulty parameter is removed entirely from the user-facing API.
  The `games` table retains its `difficulty` column as game-level metadata only.
- **Turn order and color**: Player selects their color before the game starts. `player_starts=true` →
  player is Red (R/r), goes first (standard checkers convention). `player_starts=false` → player is Black
  (B/b), AI is Red and goes first. Internally stored and passed as `player_starts: bool`, matching the
  convention used by Tic-Tac-Toe and Connect 4. The `player_symbol` and `ai_symbol` fields in the state
  reflect whichever assignment is active.
- **Game ID ownership**: The client never stores the game `id` across page loads. It is received from
  `/resume` or `/newgame` and used only to subscribe to the SSE stream. Move requests carry no `id`;
  the server derives the active game from the authenticated user + game type.
- **Multi-jump (interactive)**: Player submits each individual jump step as a separate POST. The server
  sets `must_capture` to indicate the piece that must continue jumping. The SSE stream emits a move event
  after each step. AI multi-jump chains are handled internally and emitted step-by-step with a 400ms delay
  between steps.
- **Move selection**: Tap piece to select; valid destinations highlight. No drag-and-drop.
- **Legacy endpoints retired**: `/api/game/checkers/start` and the existing `/api/game/checkers/move`
  (non-SSE) are removed. Additionally, the generic `POST /game/{game_id}/start` and
  `POST /game/{game_id}/move` endpoints in `games.py` use the old bundled architecture and must return
  `501` for `checkers` to prevent stale code paths.

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
    # Move may be invalid; no guarantee. float is reserved for future use; not stored.
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
emit(event: StatusEvent) → None
stream() → AsyncGenerator[StatusEvent]
```
- `min_interval`: 2.5 seconds between sends to client
- First status held for ~0.5s (prevents flash for near-instant AI responses)
- Heartbeat event every 30s (keeps stream alive through proxies)
- Terminal event closes the stream

### CheckersEngine (`src/backend/game_engine/checkers_engine.py`)

Implements `GameEngine`. Wraps the existing logic in `src/backend/game_logic/checkers.py`.

**Key behaviors:**
- `apply_move` executes exactly one move (a single jump step OR a non-capture step). It does NOT bundle
  the AI response in the same call.
- After each `apply_move`, sets `last_move` and recomputes `must_capture` and `legal_pieces`.
- `must_capture` is an `int` (board position) or `null`. When set, it is the position of the piece that
  must continue jumping. `validate_move` rejects any move where `from != must_capture` or the move is not
  a capture.
- `legal_pieces` is a list of board positions for all player pieces that have legal moves. Respects
  mandatory capture: if any capture is available, only pieces with captures are listed.
- King promotion: `R` → `r` when reaching row 0; `B` → `b` when reaching row 7. Promotion ends the
  multi-jump chain: `must_capture` is cleared even if the newly promoted king could otherwise continue.
- `initial_state` returns the standard checkers starting position with `current_turn` set to `"player"`
  if `player_starts=true`, else `"ai"`.

**GameState shape:**
```json
{
  "board": ["_", "B", "..."],
  "current_turn": "player" | "ai",
  "game_active": true,
  "player_starts": true,
  "player_symbol": "R",
  "ai_symbol": "B",
  "must_capture": null,
  "last_move": null,
  "legal_pieces": [40, 42, 45]
}
```

`player_symbol` and `ai_symbol` are set by `initial_state` based on `player_starts`:
- `player_starts=true`: `player_symbol="R"`, `ai_symbol="B"` (player is Red, goes first)
- `player_starts=false`: `player_symbol="B"`, `ai_symbol="R"` (player is Black, AI is Red and goes first)

`last_move` shape (set after every `apply_move`):
```json
{"from": 40, "to": 33, "captured": [36], "is_king_promotion": false}
```

Board positions: row-major, `pos = row * 8 + col`. Only dark squares where `(row + col) % 2 == 1` are
playable. Red pieces always start at rows 5–7; Black pieces always start at rows 0–2 (Red always
moves first in standard checkers, so when `player_starts=false` the AI's Red pieces start at rows 5–7).
Piece codes: `R` = Red regular, `r` = Red king, `B` = Black regular, `b` = Black king, `_` = empty.
The client maps `player_symbol`/`ai_symbol` to determine which pieces belong to the player.

### CheckersAIStrategy (`src/backend/game_engine/checkers_engine.py`)

Implements `AIStrategy`. Wraps `_get_ai_move_chain` from `checkers.py` but returns only the **first move**
in the chain as `(move, None)` — the heuristic has no eval score. The SSE handler drives the multi-jump
loop, emitting chain moves directly (bypassing `StatusBroadcaster`) with a 400ms sleep between steps:

```
while current_turn == "ai":
    move, _ = strategy.generate_move(state)   # one step
    state = engine.apply_move(state, move)
    yield move_event_sse_directly             # NOT via broadcaster; 400ms pacing
    await asyncio.sleep(0.4)
    if state["must_capture"] is None:
        break                                 # AI chain complete
```

This gives the player visible step-by-step AI captures rather than one large board jump.

### SSE Event Schema

```json
{"type": "status", "message": "Thinking..."}

{"type": "move", "data": {
  "from": 40,
  "to": 33,
  "captured": [36],
  "player": "player",
  "is_king_promotion": false,
  "board": ["_", "B", "..."],
  "player_starts": true,
  "current_turn": "ai",
  "must_capture": null,
  "legal_pieces": [],
  "status": "in_progress",
  "winner": null
}}

{"type": "move", "data": {
  "from": 5,
  "to": 12,
  "captured": [8],
  "player": "ai",
  "is_king_promotion": false,
  "board": ["_", "B", "..."],
  "player_starts": true,
  "current_turn": "player",
  "must_capture": null,
  "legal_pieces": [40, 42, 33],
  "status": "in_progress",
  "winner": null
}}

{"type": "move", "data": {
  "status": "complete",
  "winner": "player",
  "board": ["..."],
  "player_starts": true,
  "current_turn": null,
  "must_capture": null,
  "legal_pieces": []
}}

{"type": "heartbeat"}

{"type": "error", "code": "invalid_move", "message": "..."}
```

`winner` values: `"player"` | `"ai"` | `null`.

### Status Copy

Player move validation produces no status event. AI multi-jump intermediate steps emit no additional
status events (the move event itself conveys progress).

| Condition | Message |
|---|---|
| AI begins processing | `"Thinking..."` |
| 2.5s pass, AI still running | random: `["Hmm...", "Considering the board...", "Plotting a move...", "Analyzing..."]` |
| 5s+ elapsed | random: `["Taking a moment...", "Almost there..."]` |
| AI move ready | `move` event (closes the turn) |

## API Endpoints

All endpoints require authentication. 401 is returned for any unauthenticated request.

### `GET /api/game/checkers/resume`

Always called on page load. Returns the active session for the authenticated user if one exists.

**Response 200 — active session:**
```json
{"id": "uuid", "state": { "...game state..." }}
```

**Response 200 — no active session:**
```json
{"id": null, "state": null}
```

A missing session is a normal state, not an error. No 404 for this path.

### `POST /api/game/checkers/newgame`

Closes any existing active session for this user + game type, then creates a new one. If
`player_starts=false`, the AI takes the first move before the response is returned (the initial state
reflects the AI's first move and `current_turn: "player"`).

**Request:**
```json
{"player_starts": true}
```

**Response 200:**
```json
{"id": "uuid", "state": { "...initial game state..." }}
```

### `POST /api/game/checkers/move`

Submits one player move step (single jump or one step of a multi-jump chain). Active session is derived
server-side from the authenticated user + game type. No `session_id` in the request body.

**Request:**
```json
{"from": 40, "to": 33}
```

**Response 202:** Empty body. State update delivered via SSE.

**Response 422:** Invalid move. Reasons include:
- `from` does not contain a player piece
- `to` is occupied or not reachable
- Not the player's turn
- `must_capture` constraint violated (wrong piece selected, or move is not a capture)
- Game is already over

**Response 409:** No active session.

### `GET /api/game/checkers/events/{id}`

Persistent SSE stream. The authenticated user must own the session.

**Response:** `text/event-stream`

Cloud Run request timeout must be set to 3600s. Heartbeat events every 30s prevent intermediate proxy
timeouts.

## Session Lifecycle and Timeout

Sessions remain active indefinitely as long as the player reconnects. Abandoned sessions (browser closed,
navigation away, crash) are cleaned up by the existing `POST /internal/cleanup-sessions` endpoint, which
is triggered by a GCP Cloud Scheduler job.

**Timeout configuration**: `session_timeout_hours` column in the `games` table. Checkers: 24 hours
(measured from `last_move_at`).

Sessions closed by the cleanup job emit the `game.sessions.completed` metric with outcome `abandoned`,
consistent with the observability spec.

## Observability

Follows the conventions in `features/observability/spec.md`.

**`games.py` (request layer):**
- `POST /newgame`, `POST /move`, `GET /resume`, `GET /events/{id}`: set `game.id` as an attribute
  on the auto-instrumented HTTP span via `span.set_attribute`.
- No new spans at this layer.

**`games.py` — AI move processing:**
- Child span `game.ai.move` on the SSE handler. Attributes: `game.id`, `compute_duration_ms`,
  `ai_invalid_move_count`.
- For AI multi-jump chains, a single `game.ai.move` span covers the entire chain (all steps).

**`persistence_service.py`:**
- Existing child spans for `record_move` and `end_session` already cover DB writes. No changes required.

**SSE connection lifecycle:**
- SSE open: `span.set_attribute("game.id", ...)`
- SSE close (normal): `logger.info("checkers_sse_closed", extra={"game_id": game_id})`
- SSE close (error / unexpected): `logger.exception("checkers_sse_error", extra={"game_id": game_id})` +
  `span.record_exception(e)` + `span.set_status(ERROR)`

**Invalid move logging:**
- `POST /move` returning 422: `logger.warning("checkers_invalid_move", extra={"game_id": game_id, "move": move})`

**No instrumentation inside `game_engine/` files.** All manual instrumentation lives at the router and
persistence layers only.

## Client Behavior

### Page Load and Resume

The client uses five phases: `loading`, `newgame`, `resumeprompt`, `playing`, `terminal`.

1. Check `localStorage` for key `checkers_game_hint`. If present and `expires` is in the future, enter
   `loading` phase (spinner overlay on board) while `/resume` is in flight. Otherwise enter `newgame`
   immediately.
2. On `/resume` response:
   - Active in-progress session → set board state from response, enter `resumeprompt` phase. SSE is
     **not** subscribed yet.
   - Completed session → set board state, enter `terminal` phase directly (no prompt needed).
   - Null → enter `newgame` phase, clear any stale localStorage hint.

**`checkers_game_hint` shape:**
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

Shown as a board overlay in `newgame` phase. Two buttons:
- "Play as Red — Go First"
- "Play as Black — Go Second"

`player_starts: true` (Red, go first) or `false` (Black, go second) is submitted to `POST /newgame`.

The board renders immediately in `playing` phase (empty, locked) before the API responds so the layout
does not shift. When going second, the AI computes its first move server-side before `/newgame` returns;
the board updates from the response state.

### Move Submission and Loading State

1. Tap a piece → client checks it is in `legal_pieces`, selects it, and highlights valid destinations.
2. Tap a highlighted destination → client locks the board and submits `POST /move {"from": int, "to": int}`.
3. On 202: SSE events drive status display and board updates.
4. SSE `status` events update the AI `PlayerCard` status text.
5. SSE `move` event for the player's step: board updates. If `must_capture` is set and `current_turn` is
   still `"player"`, only the piece at `must_capture` is interactive, and only its capture destinations
   are shown. Another `POST /move` is submitted for the next step.
6. SSE `move` event for AI step(s): board updates per step with 400ms between AI jumps.
7. After AI turn completes, `legal_pieces` is populated for the player's next turn.

### Multi-Jump

- Player multi-jump: each step is a separate `POST /move`. After submitting a step, the client waits for
  the SSE move event to determine if continuation is required (`must_capture != null`).
- When `must_capture` is set: only the piece at `must_capture` is tappable; only its capture
  destinations are highlighted. All other pieces are non-interactive.
- Multi-jump ends when `must_capture` is null in the SSE move event.
- If king promotion occurs mid-jump: `is_king_promotion: true` in the SSE event; `must_capture` is
  cleared; the turn passes to AI.

### Outcome

Game result is displayed inside the `PlayerCard` components (above and below the board), not as a
standalone banner. A "New Game" button appears below the player card; clicking it enters `newgame` phase
(overlay on dimmed board).

### SSE Reconnect and Error Path

Browser `EventSource` reconnects automatically on disconnect. On reconnect:
1. Call `/resume`.
2. Active session → re-render board from returned state, resubscribe to SSE.
3. Null session (game ended or timed out) → render "New Game" UI, clear localStorage hint.

On any 401 from any game API: clear local game state, display `AuthModal`. No silent retry.

## UI / Layout

Layout (top to bottom): AI `PlayerCard` → board (with overlay) → player `PlayerCard` → "New Game" button.

The `PlayerCard` component (`src/frontend/src/components/PlayerCard.tsx`) is used for both participants.
See `features/player-card/spec.md` for the full component spec.

- AI card (above board): bot icon avatar, "AI Opponent" label, piece color indicator (Black), SSE status
  text during AI turn, result badge on terminal state.
- Player card (below board): user avatar / initials, display name, piece color indicator (Red or Black
  matching `player_symbol`), result badge on terminal state.
- Board orientation: player's pieces always at bottom, from the player's perspective. When
  `player_starts=true` (player is Red), Red pieces are at the bottom. When `player_starts=false` (player
  is Black), the board flips so Black pieces are at the bottom.
- Board display: 8×8 grid. Light squares are decorative only (non-interactive, muted background). Dark
  squares are playable. Only dark squares render pieces and receive tap events.
- Pieces: Red disc for R/r, dark disc for B/b. Kings display a crown overlay or inner ring on the disc
  to distinguish them from regular pieces.
- Valid move highlights: when a piece is selected, reachable destination squares are highlighted. If
  mandatory capture applies, only capture destinations are shown for the selected piece. Pieces not in
  `legal_pieces` are non-interactive and show no hover state.
- Board overlays (positioned absolute, `inset-0`, `bg-base-100/80 backdrop-blur-sm`):
  - `loading`: centred spinner.
  - `resumeprompt`: "Game in progress" label + Continue / New Game buttons.
  - `newgame`: "Choose your side:" label + "Play as Red — Go First" / "Play as Black — Go Second" buttons.
- **Mobile (< 640px)**: board fills viewport width; piece tap targets at least 44px for comfortable
  interaction; cards and controls stack above/below the board; no horizontal scroll.
- **Desktop**: max-width `lg` container centred; same vertical stack.
- All screen sizes and orientations supported without layout breakage.

## Data Persistence

Every valid move (player and AI, including each step of a multi-jump chain) is recorded via
`persistence_service.record_move()`. The `move_notation` argument must be the algebraic coordinate
string for the move (e.g. `"b6d4"` for a jump from b6 to d4; multi-jump steps recorded individually).
Terminal state triggers `persistence_service.end_game()`. See the game-data-persistence spec for the
full function signatures.

**Open question — notation conversion location**: The move request arrives as
`{from_pos, to_pos}` (board position indices). This must be converted to an algebraic coordinate
string before calling `record_move`. Decide during implementation: does this conversion live as a
method on `CheckersEngine` (preferred — engine owns the format), or inline in the router?

## Test Cases

### Unit

| Test name | Scenario |
|---|---|
| `test_checkers_engine_validate_move_invalid_from_not_player_piece` | validate_move returns false when `from` does not contain a player piece |
| `test_checkers_engine_validate_move_invalid_to_occupied` | validate_move returns false when `to` is occupied |
| `test_checkers_engine_validate_move_wrong_turn` | validate_move returns false when it is the AI's turn |
| `test_checkers_engine_validate_move_must_capture_constraint` | validate_move returns false when `must_capture` is set and `from != must_capture` |
| `test_checkers_engine_validate_move_valid_regular` | validate_move returns true for a legal non-capture move |
| `test_checkers_engine_validate_move_valid_capture` | validate_move returns true for a legal capture move |
| `test_checkers_engine_apply_move_single_step_updates_board` | apply_move moves piece from `from` to `to`, clears `from` |
| `test_checkers_engine_apply_move_capture_removes_captured_piece` | apply_move removes the captured piece and sets `captured` in `last_move` |
| `test_checkers_engine_apply_move_king_promotion_sets_flag` | apply_move sets `is_king_promotion: true` and promotes piece to lowercase when reaching back rank |
| `test_checkers_engine_apply_move_must_capture_set_on_chain_available` | apply_move sets `must_capture` to landing position when further captures are available |
| `test_checkers_engine_apply_move_must_capture_cleared_when_no_further` | apply_move clears `must_capture` when no further captures exist from landing position |
| `test_checkers_engine_apply_move_must_capture_cleared_on_promotion` | apply_move clears `must_capture` even if further captures exist when king promotion occurs |
| `test_checkers_engine_is_terminal_player_wins_no_ai_pieces` | is_terminal returns (True, "player") when AI has no pieces |
| `test_checkers_engine_is_terminal_ai_wins_no_player_pieces` | is_terminal returns (True, "ai") when player has no pieces |
| `test_checkers_engine_is_terminal_player_wins_ai_blocked` | is_terminal returns (True, "player") when AI has pieces but no legal moves |
| `test_checkers_engine_is_terminal_ai_wins_player_blocked` | is_terminal returns (True, "ai") when player has pieces but no legal moves |
| `test_checkers_engine_is_terminal_in_progress` | is_terminal returns (False, None) for an active game |
| `test_checkers_engine_get_legal_moves_mandatory_capture_only` | get_legal_moves returns only capture moves when any capture is available |
| `test_checkers_engine_get_legal_moves_no_captures_returns_all` | get_legal_moves returns all regular moves when no captures available |
| `test_checkers_engine_get_legal_moves_empty_when_blocked` | get_legal_moves returns empty list when the current player has no moves |
| `test_checkers_engine_get_legal_pieces_captures_only_when_available` | get_legal_pieces returns only pieces that have captures when captures exist |
| `test_checkers_engine_get_legal_pieces_all_movable_when_no_captures` | get_legal_pieces returns all pieces with any legal move when no captures exist |
| `test_move_processor_ai_invalid_move_retries` | processor retries on invalid AI move, logs warning |
| `test_move_processor_ai_fallback_after_max_retries` | processor falls back to random valid move after max retries |
| `test_status_broadcaster_enforces_min_interval` | broadcaster holds events to min_interval |
| `test_status_broadcaster_closes_on_terminal_event` | stream terminates after terminal event |
| `test_status_broadcaster_emits_heartbeat` | heartbeat event emitted at configured interval |

### API Integration

| Test name | Scenario |
|---|---|
| `test_checkers_resume_no_active_session` | GET /resume returns `{id: null, state: null}` |
| `test_checkers_resume_active_session_returns_state` | GET /resume returns current board state and id |
| `test_checkers_resume_unauthenticated_returns_401` | GET /resume without auth cookie |
| `test_checkers_newgame_player_first` | POST /newgame player_starts=true → state has current_turn="player", Red pieces at rows 5-7 |
| `test_checkers_newgame_ai_first` | POST /newgame player_starts=false → state reflects AI's first move, current_turn="player" |
| `test_checkers_newgame_closes_existing_session` | POST /newgame closes old active session, creates new session |
| `test_checkers_move_valid_returns_202` | POST /move with a legal move returns 202 and empty body |
| `test_checkers_move_invalid_piece_returns_422` | POST /move where `from` is not a player piece |
| `test_checkers_move_must_capture_constraint_violated_returns_422` | POST /move where `must_capture` is set but wrong piece selected |
| `test_checkers_move_no_session_returns_409` | POST /move with no active session |
| `test_checkers_move_unauthenticated_returns_401` | POST /move without auth |
| `test_checkers_sse_delivers_status_then_move` | SSE delivers status event(s) followed by move event in order |
| `test_checkers_sse_heartbeat_within_interval` | SSE sends heartbeat within 35s of idle |
| `test_checkers_sse_unauthorized_session_returns_403` | GET /events/{id} for another user's session returns 403 |
| `test_checkers_sse_stream_closes_on_terminal_state` | SSE stream closes after a game-over move event |
| `test_checkers_sse_move_triggers_record_move` | SSE move event results in a DB record_move call |
| `test_checkers_multijump_two_posts_complete_chain` | Two sequential POSTs complete a two-step capture chain; board reflects each intermediate step |
| `test_checkers_cleanup_marks_stale_sessions_abandoned` | Cleanup endpoint marks sessions past session_timeout_hours as abandoned |

### E2E

| Test name | Scenario |
|---|---|
| `test_checkers_full_game_player_wins` | Player plays to win by capturing all AI pieces; result badge appears in PlayerCards |
| `test_checkers_full_game_ai_wins` | AI wins; loss result appears in PlayerCards |
| `test_checkers_full_game_ai_blocked_player_wins` | Player wins by blocking all AI moves (no captures required) |
| `test_checkers_multijump_player_completes_two_step_capture` | Player executes a two-step jump; board updates after each POST |
| `test_checkers_king_promotion_shows_crown_visual` | Piece reaching back rank renders with crown overlay |
| `test_checkers_mandatory_capture_only_capture_destinations_shown` | When a capture is available, only capture destinations are highlighted for the capturing piece |
| `test_checkers_resume_prompt_shown_for_in_progress_session` | resumeprompt overlay renders over dimmed board when active session found on page load |
| `test_checkers_resume_prompt_continue_starts_sse` | Clicking Continue from resumeprompt subscribes to SSE and enters playing phase |
| `test_checkers_resume_prompt_new_game_shows_side_selector` | Clicking New Game from resumeprompt shows turn-order overlay |
| `test_checkers_go_second_ai_makes_first_move` | With player_starts=false, AI's first move is reflected in the state returned by /newgame |
| `test_checkers_result_shown_in_player_cards` | Win/loss badge appears in both PlayerCards, not as a standalone alert |
| `test_checkers_new_game_abandons_in_progress_session` | "New Game" closes old session and starts a fresh board |
| `test_checkers_unauthenticated_user_sees_login_prompt` | Auth gate shows centred sign-in card blocking game UI |
| `test_checkers_resume_after_page_refresh` | Mid-game refresh restores board state via /resume |
| `test_checkers_401_shows_auth_modal` | 401 from any game API triggers AuthModal |
| `test_checkers_mobile_viewport_playable` | Board fully playable at 375px wide; tap targets meet minimum size |
| `test_checkers_sse_reconnect_restores_state` | SSE disconnect and reconnect shows correct board state |
| `test_checkers_sse_reconnect_after_game_ends` | Reconnect to closed stream renders New Game UI |

### Manual

| Scenario |
|---|
| Crown overlay clearly distinguishes king pieces from regular pieces on both Red and Black |
| Only pieces in `legal_pieces` are interactive; non-legal pieces show no hover state |
| Multi-jump continuation: only the jumping piece is interactive and highlighted mid-chain; all other pieces are locked |
| AI capture chain animates step-by-step with visible ~400ms delay between each jump |
| Board orientation is correct: player's pieces at bottom, opponent at top, for both Red and Black player perspectives |
| Status text changes are readable at 2–3s intervals — not flickering, not stale |
| Loading spinner renders before /resume resolves when localStorage hint is present |
| Piece tap targets are comfortable on a physical mobile device |
| Landscape orientation on mobile renders without layout breakage |
| SSE reconnects and restores board correctly after a simulated network drop |
| AI "Thinking..." text appears inside the AI PlayerCard during AI turn, not below the board |
| Resume prompt shows correct board state (dimmed) when returning to an in-progress game |
