# Game: Chess

**Status: ready**

## Background

Backend game logic is fully implemented in `src/backend/game_logic/chess.py`, including all standard chess
rules: piece movement, castling, en passant, pawn promotion, check, checkmate, and stalemate. The existing
`src/frontend/public/js/basic-chess-ai.js` (~39KB minimax with alpha-beta pruning) and
`src/frontend/public/js/chess-evaluation.js` (piece-square table evaluation) are legacy client-side files
from the pre-React implementation. Their logic is **ported to Python** as `ChessAIStrategy` and the
original JS files are deleted as part of this feature.
Legacy REST endpoints at `/api/game/chess/start`, `/api/game/chess/move`, and
`/api/game/chess/session/{id}` are also retired. The React page at
`src/frontend/src/pages/games/ChessPage.tsx` is currently a stub. The game-data-persistence feature is
complete and integrated. This spec supersedes the Chess section of the react-migration Phase 3 spec and
resolves the transport open question in `features/websocket/spec.md` for turn-based games: SSE, not
WebSocket.

Chess is the most complex game in the set and is implemented last.

## Resolved Design Decisions

- **Auth required**: No unauthenticated gameplay. Game pages display a login prompt blocking the game UI
  for unauthenticated users. Any API call without a valid session returns 401; the client surfaces an
  `AuthModal`, no silent retry.
- **Transport**: Server-Sent Events for all server→client push. Client POSTs moves (202 Accepted, no state
  in response); state updates arrive over SSE.
- **One session per user per game**: Enforced by existing DB partial unique index. Starting a new game
  explicitly closes any existing active session before creating a new one.
- **No AI difficulty**: The AI difficulty parameter is removed entirely from the user-facing API. The
  `games` table retains its `difficulty` column as game-level metadata (indicating how hard the game is
  for humans — Chess is "high"). This is unrelated to AI difficulty and must not be conflated.
- **Turn order**: Player selects whether to go first (White) or second (Black) before the game starts.
  Internally this is stored and passed as `player_starts: bool`. If `player_starts` is false, the AI
  (White) takes the first move before `/newgame` returns.
- **Game ID ownership**: The client never stores the game `id` across page loads. It is received from
  `/resume` or `/newgame` and used only to subscribe to the SSE stream. Move requests carry no `id`;
  the server derives the active game from the authenticated user + game type.
- **Board orientation**: Always rendered from the player's perspective. White player = row 7 at bottom
  (standard). Black player = row 0 at bottom (flipped).
- **Pawn promotion**: When the player moves a pawn to the back rank, the client shows a promotion modal
  overlay (same style as the "New Game" overlay — centred, backdrop blur) presenting the four valid
  choices: Queen, Rook, Bishop, Knight (as piece icons in the player's color). The POST is held until the
  player selects a piece, then sent with `promotionPiece` set to the chosen piece. AI always promotes to
  queen automatically.
- **Check/checkmate/stalemate**: Fully server-side. The SSE move event includes `in_check: bool` for the
  player whose turn it now is. Stalemate is a draw.
- **Move selection**: Two-click model. Tap a piece to select it; tap a highlighted destination to submit.
  No drag-and-drop.
- **Valid move highlighting**: On piece tap, client calls `GET /api/game/chess/legal-moves?from_row=r&from_col=c`
  to get valid destinations and highlights them. Castling and en passant destinations appear as normal
  highlighted squares; the server handles the special mechanics automatically.
- **Captured pieces display**: Shown as a row of small piece icons adjacent to each `PlayerCard`.
- **Move history**: Scrollable list of move pairs. Notation comes from the `notation` field in each SSE
  move event (server-generated long algebraic notation). Client accumulates entries from received events.
- **Legacy files deleted**: `src/frontend/public/js/basic-chess-ai.js` and
  `src/frontend/public/js/chess-evaluation.js` are deleted after their logic is ported to `ChessAIStrategy`.

## Architecture

### Abstractions (shared across all turn-based games)

These live in `src/backend/game_engine/base.py`. Chess implements the same `GameEngine` and `AIStrategy`
ABCs as Tic-Tac-Toe.

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
emit(event: StatusEvent) → None     # called by game processor at full speed; non-blocking
stream() → AsyncGenerator[StatusEvent]  # drives the SSE endpoint; enforces min_interval
```
- `min_interval`: 2.5 seconds between sends to client
- First status held for ~0.5s (prevents flash for near-instant AI responses)
- Heartbeat event every 30s (client ignores; keeps stream alive through proxies)
- Terminal event closes the stream

### ChessEngine (`src/backend/game_engine/chess_engine.py`)

Implements `GameEngine`. Wraps the existing logic in `src/backend/game_logic/chess.py`.

**`initial_state(player_starts: bool) → GameState`**: Returns a fresh board. If `player_starts` is false,
`player_color` is `"black"` and `current_player` is `"white"`.

**`apply_move(state, move) → GameState`**: Executes exactly one move (player or AI). Does not process the
opponent. Uses existing `_get_valid_moves` and `_execute_move` logic. Updates board, `castling_rights`,
`en_passant_target`, `king_positions`, `captured_pieces`. Sets `last_move` (see GameState shape below).
Toggles `current_player`. Does NOT call `_check_game_end`. Computes `in_check` as
`_is_in_check(state, state["current_player"])` after the move.

**`is_terminal(state) → tuple[bool, outcome | None]`**: Calls `_check_game_end`. Maps winner to
`"player_won"` | `"ai_won"` | `"draw"`.

**`get_legal_moves(state) → list[Move]`**: Returns all legal moves for the current player as
`[{"fromRow", "fromCol", "toRow", "toCol", "promotionPiece"}, ...]`. Used by the legal-moves endpoint
and the AI fallback path.

### ChessAIStrategy (`src/backend/game_engine/chess_engine.py`)

Implements `AIStrategy`. Ports the minimax with alpha-beta pruning from `basic-chess-ai.js` and the
piece-square table evaluation from `chess-evaluation.js` to Python. Search depth: configurable constant
(default 3). Returns a single move dict with `promotionPiece` set to `"Q"`/`"q"` for AI pawn promotion.

The ported evaluation function produces a score in centipawns (positive = AI advantage). This is stored
as `engine_eval` normalized to `[-1, 1]` by dividing by a scaling factor (e.g., 1000 centipawns = ±1.0,
clamped). This replaces the earlier "store null" decision that assumed a random AI.

### GameState Shape

```json
{
  "board": [[...8×8...]],
  "current_player": "white" | "black",
  "player_color": "white" | "black",
  "game_active": true,
  "player_starts": true,
  "king_positions": {"white": [7, 4], "black": [0, 4]},
  "castling_rights": {
    "white": {"kingside": true, "queenside": true},
    "black": {"kingside": true, "queenside": true}
  },
  "en_passant_target": null,
  "captured_pieces": {"player": [], "ai": []},
  "last_move": null,
  "in_check": false
}
```

Board: 8×8 2D array, row 0 = black's back rank, row 7 = white's back rank. Uppercase = white
(R, N, B, Q, K, P), lowercase = black (r, n, b, q, k, p), null = empty.

`last_move` shape (null until the first move is made):
```json
{
  "fromRow": 6, "fromCol": 4, "toRow": 4, "toCol": 4,
  "piece": "P",
  "captured": null,
  "is_castling": false,
  "is_en_passant": false,
  "promotion": null,
  "notation": "e2-e4"
}
```

`in_check` is computed after each `apply_move` call: `_is_in_check(state, state["current_player"])`.

### SSE Event Schema

```json
{"type": "status", "message": "Thinking..."}

{"type": "move", "data": {
  "fromRow": 6, "fromCol": 4, "toRow": 4, "toCol": 4,
  "piece": "P",
  "captured": null,
  "is_castling": false,
  "is_en_passant": false,
  "promotion": null,
  "notation": "e2-e4",
  "player": "player",
  "board": [[...8×8...]],
  "player_color": "white",
  "current_player": "black",
  "in_check": false,
  "captured_pieces": {"player": [], "ai": []},
  "en_passant_target": [5, 4],
  "castling_rights": {
    "white": {"kingside": true, "queenside": true},
    "black": {"kingside": true, "queenside": true}
  },
  "status": "in_progress",
  "winner": null
}}

{"type": "move", "data": {
  "fromRow": 3, "fromCol": 4, "toRow": 1, "toCol": 4,
  "piece": "q",
  "captured": null,
  "is_castling": false,
  "is_en_passant": false,
  "promotion": null,
  "notation": "e5-e7#",
  "player": "ai",
  "board": [[...8×8...]],
  "player_color": "white",
  "current_player": null,
  "in_check": true,
  "captured_pieces": {"player": [], "ai": []},
  "en_passant_target": null,
  "castling_rights": {
    "white": {"kingside": true, "queenside": true},
    "black": {"kingside": true, "queenside": true}
  },
  "status": "complete",
  "winner": "ai"
}}

{"type": "heartbeat"}

{"type": "error", "code": "invalid_move", "message": "..."}
```

`status` is `"in_progress"` or `"complete"`. `winner` is `"player"` | `"ai"` | `"draw"` | null.
`current_player` is null when the game is complete.

### Status Copy

Player move validation produces no status event — the client already reflects the move visually and
validation is near-instant.

| Condition | Message |
|---|---|
| AI begins processing | `"Thinking..."` |
| 2.5s pass, AI still running | random: `["Analyzing...", "Considering...", "Plotting a move...", "Hmm..."]` |
| 5s+ elapsed | random: `["Taking a moment...", "Almost there..."]` |
| AI move ready | `move` event (closes the turn) |

## API Endpoints

All endpoints require authentication. 401 is returned for any unauthenticated request.

### `GET /api/game/chess/resume`

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
The client handles the null case by rendering the "New Game" UI. There is no 404 for this path — a
missing session is a normal state, not an error.

### `POST /api/game/chess/newgame`

Called only when the player explicitly chooses to start a new game. Closes any existing active game
for this user + game type, then creates a new one. If `player_starts` is false, the AI (White) takes
the first move server-side before the response is returned; the initial state in the response reflects
that move.

**Request:**
```json
{"player_starts": true}
```

**Response 200:**
```json
{"id": "uuid", "state": { ...initial game state... }}
```

### `POST /api/game/chess/move`

Submits the player's move. Active game is derived server-side from the authenticated user + game
type. No `id` in request.

**Request:**
```json
{"fromRow": 6, "fromCol": 4, "toRow": 4, "toCol": 4, "promotionPiece": null}
```

`promotionPiece` is required when the move is a pawn-reaches-back-rank move; the client holds the POST
until the player selects a piece from the promotion modal. `null` for all other moves.

**Response 202:** Empty body. State update delivered via SSE.

**Response 422:** Invalid move (wrong color piece, illegal destination, moves into check, not player's
turn, game already over, pawn-reaches-back-rank move submitted with `promotionPiece: null`).

**Response 409:** No active game.

### `GET /api/game/chess/events/{id}`

Persistent SSE stream. Authenticated user must own the game record.

**Response:** `text/event-stream`

Cloud Run request timeout must be raised to 3600s. Heartbeat events every 30s prevent intermediate
proxy timeouts.

### `GET /api/game/chess/legal-moves`

Returns all legal destinations for the piece at the given square for the current player. Read-only;
uses the existing `_get_valid_moves` logic via `ChessEngine.get_legal_moves` filtered to the specified
source square.

**Query params:** `from_row` (int), `from_col` (int)

**Response 200:**
```json
{"moves": [[4, 4], [5, 4]]}
```
Each element is `[toRow, toCol]`.

**Response 422:** `from_row` or `from_col` out of range, or no piece at square, or piece belongs to
opponent.

**Response 409:** No active session.

## Session Lifecycle and Timeout

A session remains active indefinitely as long as the player reconnects and resumes. Sessions abandoned
without explicit closure must eventually be cleaned up.

**Timeout configuration**: The `games` DB table `session_timeout_hours` column (integer, not null).
Chess: 24 hours. This is the maximum idle time (measured from `last_move_at`) before a session is
marked abandoned.

**Cleanup mechanism**: A GCP Cloud Scheduler job fires periodically (e.g., every hour) and calls an
internal, non-public endpoint (`POST /internal/cleanup-sessions`). This endpoint queries all
`in_progress` sessions where `last_move_at < now() - session_timeout_hours` and marks them abandoned
via `end_game()`. The endpoint requires an internal-only auth header (not the user session
cookie).

Sessions closed this way emit the `game.sessions.completed` metric with outcome `abandoned`, consistent
with the observability spec.

## Observability

Follows the conventions in `features/observability/spec.md`.

**`games.py` (request layer):**
- `POST /newgame`, `POST /move`, `GET /resume`, `GET /events/{id}`, `GET /legal-moves`: set
  `game.id` as an attribute on the auto-instrumented HTTP span via `span.set_attribute`.
- No new spans at this layer.

**`games.py` — AI move processing:**
- Child span `game.ai.move` on the SSE handler. Attributes: `game.id`, `compute_duration_ms`,
  `ai_invalid_move_count`.

**`persistence_service.py`:**
- Existing child spans for `record_move` and `end_game` already cover DB writes. No changes required.

**SSE connection lifecycle:**
- SSE open: `span.set_attribute("game.id", ...)`
- SSE close (normal): `logger.info("chess_sse_closed", extra={"game_id": game_id})`
- SSE close (error / unexpected): `logger.exception("chess_sse_error", extra={"game_id": game_id})` +
  `span.record_exception(e)` + `span.set_status(ERROR)`
- Per-message spans: not required (too noisy). The `game.ai.move` child span covers the significant event.

**Invalid move logging:**
- `POST /move` returning 422: `logger.warning("chess_invalid_move", extra={"game_id": game_id, "move": move})`

**`GET /legal-moves` logging:**
- This endpoint is called on every piece tap and is high-frequency. It must NOT emit INFO-level log
  records per call. The span attribute `game.id` is sufficient for trace-level visibility. Only log
  at WARNING or higher if the endpoint returns 422.

**No instrumentation inside `game_engine/` files.** All manual instrumentation lives at the router and
persistence layers only.

## Client Behavior

### Page Load and Resume

The client uses five phases: `loading`, `newgame`, `resumeprompt`, `playing`, `terminal`.

1. Check `localStorage` for key `chess_game_hint`. If present and `expires` is in the future, enter
   `loading` phase (spinner overlay on board) while `/resume` is in flight. Otherwise enter `newgame`
   immediately.
2. On `/resume` response:
   - Active in-progress session → set board state from response, enter `resumeprompt` phase. SSE is
     **not** subscribed yet.
   - Completed session → set board state, enter `terminal` phase directly (no prompt needed).
   - Null → enter `newgame` phase, clear any stale localStorage hint.

**`chess_game_hint` shape:**
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

Shown as a board overlay in `newgame` phase. Two buttons: "Play as White — Go First" / "Play as Black
— Go Second (AI moves first)". Submitting triggers `POST /newgame` with `player_starts: true/false`.

The board renders immediately in `playing` phase (empty, locked) before the API responds so the layout
does not shift. When going second (Black), the AI computes White's first move server-side before
`/newgame` returns; the board updates with that move once the response arrives.

### Piece Selection and Legal Moves

1. Tap player's own piece → client calls `GET /api/game/chess/legal-moves?from_row=r&from_col=c`.
2. While loading: selected piece shows loading state (opacity pulse).
3. On response: highlight all valid destination squares; show selected piece as "active" (highlighted
   border or background).
4. Tap a highlighted square → `POST /move` with coords + auto-promotion piece if applicable. Board
   locks on 202; unlocks when AI move arrives via SSE.
5. Tap the same piece again → deselect.
6. Tap another own piece → reselect (calls legal-moves for the new piece).
7. Tap a non-highlighted square or opponent piece → deselect.

Board is locked (no interaction) while awaiting AI move via SSE.

### Pawn Promotion Modal

When the player selects a pawn and taps a back-rank destination (`toRow == 0` for White, `toRow == 7`
for Black), the client does NOT immediately POST the move. Instead, a promotion overlay appears
(positioned and styled identically to the "New Game" overlay: centred, `bg-base-100/80 backdrop-blur-sm`
over the dimmed board). The overlay shows four piece options as icons in the player's color:

- Queen
- Rook
- Bishop
- Knight

Tapping a piece closes the overlay and fires `POST /move` with `promotionPiece` set to the appropriate
letter (`"Q"` / `"R"` / `"B"` / `"N"` for White; lowercase for Black). The board remains locked while
the overlay is visible. Tapping outside the overlay cancels the move and returns to the piece-selected
state (valid destinations still highlighted).

### Check Indicator

When a `move` event arrives with `in_check: true` and `current_player == player_color`, highlight the
player's king square with a red background. Clear the indicator when the next move event arrives.

When `in_check: true` and `current_player != player_color` (opponent is in check), optionally show a
subtle indicator on the opponent king square (e.g., muted highlight). Terminal move events with
`in_check: true` indicate checkmate.

### Captured Pieces

Each player's captured pieces are rendered as a row of small piece icons:
- Row above the AI `PlayerCard`: pieces captured by the AI (pieces the player has lost, rendered from
  the player's perspective as pieces removed from their side).
- Row below the Player `PlayerCard`: pieces captured by the player (pieces the player has taken).

Use the `captured_pieces` field from each SSE move event. Update in real time on receipt. Use Unicode
chess symbols or SVG sprites.

### Move History

A scrollable list of move pairs rendered below the captured pieces section. The client accumulates
entries from received SSE move events. Format: `1. e2-e4  e7-e5`, `2. Ng1-f3  Nb8-c6`. Notation comes
from the `notation` field in each move event. Always scroll to the latest move on update.

On mobile, the move history panel is collapsible. On desktop, it is always visible.

### Outcome

Game result is displayed inside the `PlayerCard` components (above and below the board), not as a
standalone banner. A "New Game" button appears below the player card; clicking it enters `newgame`
phase (overlay on dimmed board).

Outcome states:
- Checkmate: winner's card shows win badge; loser's card shows loss badge.
- Stalemate: both cards show draw badge.

### SSE Reconnect and Error Path

Browser `EventSource` reconnects automatically on disconnect. On reconnect:
1. Call `/resume`.
2. If active session: re-render board from returned state, resubscribe to SSE.
3. If null session (stream closed because game ended, or session timed out): render "New Game" UI,
   clear localStorage hint.

On any 401 from any game API: clear local game state, display `AuthModal`. No silent retry.

## UI / Layout

Layout (top to bottom): AI `PlayerCard` → captured pieces (AI's captures) → board (with overlay) →
captured pieces (player's captures) → Player `PlayerCard` → move history panel → "New Game" button.

The `PlayerCard` component (`src/frontend/src/components/PlayerCard.tsx`) is used for both participants.
See `features/player-card/spec.md` for the full component spec.

- AI card (above board): bot icon avatar, "AI Opponent" label, color indicator, SSE status text during
  AI turn, result badge on terminal state.
- Player card (below board): user avatar / initials, display name, color indicator, result badge on
  terminal state.
- Board overlays (positioned absolute, `inset-0`, `bg-base-100/80 backdrop-blur-sm`):
  - `loading`: centred spinner.
  - `resumeprompt`: "Game in progress" label + Continue / New Game buttons.
  - `newgame`: "Choose your color:" label + Go First (White) / Go Second (Black) buttons.

### Board Orientation

- `player_color == "white"`: row 7 at bottom, row 0 at top (standard). Files a–h left to right. Ranks
  1–8 bottom to top.
- `player_color == "black"`: row 0 at bottom, row 7 at top (flipped). Files h–a left to right (from
  black's perspective). Ranks 8–1 bottom to top.

Rank and file labels are rendered outside the board edge, oriented from the player's perspective.

### Piece Rendering

Use Unicode chess symbols or SVG sprites. White pieces: ♔♕♖♗♘♙. Black pieces: ♚♛♜♝♞♟. Pieces must
be distinguishable at small sizes on mobile.

Square highlighting states:
- Selected piece: distinct background (e.g., accent color).
- Valid destination: dot or semi-transparent overlay.
- Last move (from and to squares): subtle tinted background.
- King in check: red background on the king square.

### Captured Pieces Display

Small piece icons in a compact row. Group by piece type if desired. No strict ordering required. Updated
in real time from SSE move events.

### Move History Panel

- Desktop: always visible, fixed height with internal scroll, positioned below the captured pieces.
- Mobile: collapsible section. Collapsed by default. Header shows move count; tap to expand.
- Autoscrolls to the latest entry on each new move event.
- Format: `{n}. {white_notation}  {black_notation}`. White notation is added on White's move event;
  black notation fills in on Black's move event.

### Mobile Layout

- Board fills viewport width (max 100vw). Each square is at least 40×40px for comfortable tap targets.
- Captured pieces, move history, and controls stack below the board.
- No horizontal scroll at any viewport width.
- Landscape orientation supported without layout breakage.

## Data Persistence

Every valid move (player and AI) is recorded via `persistence_service.record_move()`. The
`move_notation` argument must be the UCI string for the move (e.g. `"e2e4"`, `"e1g1"` for kingside
castling, `"e7e8q"` for promotion to queen). `board_state_after` is the full game state dict after
`apply_move`. Terminal state triggers `persistence_service.end_game()`. See the game-data-persistence
spec for the full function signatures.

**Notation conversion**: The engine owns the notation format. `ChessEngine` exposes a
`to_notation(move: dict) -> str` method that converts `{fromRow, fromCol, toRow, toCol, promotionPiece}`
to a UCI string (e.g. `"e2e4"`, `"e1g1"` for castling, `"e7e8q"` for promotion). The router calls
`engine.to_notation(move)` before passing the string to `record_move`.

## Legacy Cleanup

As part of implementation:
1. Port minimax + alpha-beta pruning from `basic-chess-ai.js` to `ChessAIStrategy` in Python.
2. Port evaluation function + piece-square tables from `chess-evaluation.js` to Python.
3. Delete both JS files: `src/frontend/public/js/basic-chess-ai.js` and `src/frontend/public/js/chess-evaluation.js`.

All AI logic runs server-side. The legacy REST endpoints `/api/game/chess/start`,
`/api/game/chess/move` (non-SSE), and `/api/game/chess/session/{id}` are removed from
`src/backend/games.py`. The generic `POST /game/{game_id}/start` and `POST /game/{game_id}/move`
endpoints also use the old bundled architecture and must return `501` for `chess`.

## Test Cases

### Unit

| Test name | Scenario |
|---|---|
| `test_chess_engine_validate_move_wrong_color` | validate_move returns false when moving opponent's piece |
| `test_chess_engine_validate_move_occupied_by_own_piece` | validate_move returns false when destination occupied by own piece |
| `test_chess_engine_validate_move_moves_into_check` | validate_move returns false when move leaves own king in check |
| `test_chess_engine_validate_move_valid` | validate_move returns true for a legal pawn advance |
| `test_chess_engine_apply_move_regular_updates_board` | apply_move places piece at destination, clears source |
| `test_chess_engine_apply_move_capture_added_to_captured_pieces` | apply_move adds captured piece to captured_pieces |
| `test_chess_engine_apply_move_castling_moves_rook` | apply_move kingside castling repositions rook correctly |
| `test_chess_engine_apply_move_en_passant_removes_pawn` | apply_move en passant removes captured pawn from board |
| `test_chess_engine_apply_move_pawn_promotion_replaces_piece` | apply_move replaces promoted pawn with queen |
| `test_chess_engine_apply_move_toggles_current_player` | apply_move alternates current_player after each move |
| `test_chess_engine_apply_move_last_move_set` | apply_move populates last_move with correct fields including notation |
| `test_chess_engine_is_terminal_checkmate_player_won` | is_terminal returns (True, "player_won") for checkmate against AI |
| `test_chess_engine_is_terminal_checkmate_ai_won` | is_terminal returns (True, "ai_won") for checkmate against player |
| `test_chess_engine_is_terminal_stalemate_draw` | is_terminal returns (True, "draw") for stalemate |
| `test_chess_engine_is_terminal_in_progress` | is_terminal returns (False, None) mid-game |
| `test_chess_engine_get_legal_moves_pawn_starting` | pawn on starting rank returns two forward moves |
| `test_chess_engine_get_legal_moves_castling_included` | castling moves present when rights intact and path clear |
| `test_chess_engine_get_legal_moves_empty_when_checkmated` | returns empty list when player is checkmated |
| `test_chess_engine_get_legal_moves_excludes_moves_into_check` | moves that expose king are excluded |
| `test_chess_engine_notation_regular_move` | last_move.notation is "e2-e4" for pawn advance |
| `test_chess_engine_notation_castling_kingside` | last_move.notation is "O-O" for kingside castling |
| `test_chess_engine_notation_castling_queenside` | last_move.notation is "O-O-O" for queenside castling |
| `test_chess_engine_notation_promotion` | last_move.notation is "e7-e8=Q" for pawn promotion |
| `test_chess_engine_in_check_set_after_move` | in_check field is true when current_player's king is in check after apply_move |
| `test_move_processor_ai_invalid_move_retries` | processor retries on invalid AI move, logs warning |
| `test_move_processor_ai_fallback_after_max_retries` | processor falls back to random valid move after exhausting retries |
| `test_status_broadcaster_enforces_min_interval` | broadcaster holds events to min_interval |
| `test_status_broadcaster_closes_on_terminal_event` | stream terminates after terminal event |
| `test_status_broadcaster_emits_heartbeat` | heartbeat event emitted at configured interval |

### API Integration

| Test name | Scenario |
|---|---|
| `test_chess_resume_no_active_session` | GET /resume returns {id: null, state: null} |
| `test_chess_resume_active_session_returns_state` | GET /resume returns current board state and id |
| `test_chess_resume_unauthenticated_returns_401` | GET /resume without auth |
| `test_chess_newgame_player_white` | POST /newgame player_starts=true → board in initial state, current_player=white |
| `test_chess_newgame_player_black_ai_moves_first` | POST /newgame player_starts=false → state reflects AI's first white move |
| `test_chess_newgame_closes_existing_session` | POST /newgame closes old active session, creates new one |
| `test_chess_move_returns_202` | POST /move valid move returns 202, no body |
| `test_chess_move_invalid_piece_returns_422` | POST /move with coords pointing to empty square |
| `test_chess_move_illegal_destination_returns_422` | POST /move destination would leave king in check |
| `test_chess_move_no_active_session_returns_409` | POST /move with no session for user |
| `test_chess_move_unauthenticated_returns_401` | POST /move without auth |
| `test_chess_legal_moves_pawn` | GET /legal-moves for a pawn returns correct destinations |
| `test_chess_legal_moves_knight` | GET /legal-moves for a knight returns correct L-shaped destinations |
| `test_chess_legal_moves_king_castling` | GET /legal-moves for king includes castling destinations when eligible |
| `test_chess_legal_moves_no_active_session_returns_409` | GET /legal-moves with no session |
| `test_chess_sse_delivers_status_then_move` | SSE delivers status event(s) then move event in order |
| `test_chess_sse_move_in_check_flag` | SSE move event has in_check=true when player is in check after AI move |
| `test_chess_sse_heartbeat_within_interval` | SSE sends heartbeat within 35s of idle |
| `test_chess_sse_unauthorized_session_returns_403` | GET /events/{id} for another user's session |
| `test_chess_sse_stream_closes_on_terminal_state` | SSE stream closes after game-over move event |
| `test_chess_sse_move_triggers_record_move` | SSE move event results in DB record_move call with correct UCI notation |
| `test_chess_cleanup_marks_stale_sessions_abandoned` | Cleanup endpoint marks chess sessions past 24h timeout as abandoned |

### E2E

| Test name | Scenario |
|---|---|
| `test_chess_full_game_player_wins` | Player plays to checkmate AI; win badge appears in player card |
| `test_chess_full_game_ai_wins` | AI checkmates player; loss badge appears in player card |
| `test_chess_full_game_draw_stalemate` | Game ends in stalemate; draw badge appears in both cards |
| `test_chess_valid_move_highlights_appear_after_piece_tap` | Tapping a piece shows highlighted destination squares |
| `test_chess_tap_non_highlighted_square_does_nothing` | Tapping a non-highlighted square deselects piece, no move submitted |
| `test_chess_castling_rook_moves_automatically` | Player clicks king 2 squares; rook repositions in UI after AI SSE event |
| `test_chess_en_passant_captured_pawn_disappears` | Player executes en passant; captured pawn is removed from board |
| `test_chess_pawn_promotion_modal_appears` | Pawn moves to back rank; promotion overlay appears with 4 piece options |
| `test_chess_pawn_promotion_selects_piece` | Selecting rook from promotion modal POSTs with promotionPiece="R" and board shows rook |
| `test_chess_pawn_promotion_cancel_keeps_selection` | Tapping outside overlay cancels and valid destinations remain highlighted |
| `test_chess_check_indicator_king_square_red` | King square turns red when player is in check |
| `test_chess_captured_pieces_update_in_real_time` | Captured piece icons update immediately on SSE move event |
| `test_chess_move_history_scrolls_and_shows_notation` | Move history list accumulates notation and scrolls to latest entry |
| `test_chess_resume_prompt_shown_for_in_progress_session` | resumeprompt overlay renders over dimmed board when active session found |
| `test_chess_resume_prompt_continue_starts_sse` | Clicking Continue from resumeprompt subscribes to SSE and enters playing |
| `test_chess_resume_prompt_new_game_shows_side_selector` | Clicking New Game from resumeprompt shows color selector overlay |
| `test_chess_go_second_ai_moves_first` | Player chooses Black; board shows White's first AI move before player can interact |
| `test_chess_board_flipped_for_black_player` | When player is Black, black pieces appear at bottom of board |
| `test_chess_result_shown_in_player_cards` | Win/loss/draw badge appears in both PlayerCards, not as standalone alert |
| `test_chess_new_game_abandons_in_progress_session` | "New Game" closes old session and starts a fresh one |
| `test_chess_unauthenticated_user_sees_login_prompt` | Auth gate shows centred sign-in card |
| `test_chess_resume_after_page_refresh` | Mid-game refresh restores board state from /resume |
| `test_chess_401_shows_auth_modal` | 401 from any game API triggers AuthModal |
| `test_chess_sse_reconnect_restores_state` | SSE disconnect + reconnect shows correct board state |
| `test_chess_sse_reconnect_after_game_ends` | Reconnect to closed stream after game over renders new game UI |
| `test_chess_mobile_viewport_playable` | Board fully playable at 375px wide; tap targets ≥ 40px |

### Manual

| Scenario |
|---|
| Board orientation is correct for both white and black players |
| Highlighted valid move squares are visually clear and not confusing |
| Castling move is discoverable (king's +2 square appears as a valid destination) |
| Check indicator (red king square) is prominent and immediately noticeable |
| Captured pieces display is clean and readable at small icon sizes |
| Move history scrolls to the latest move automatically |
| AI "Thinking..." text appears inside the AI card during AI turn, not below the board |
| Promotion to queen is seamless — no dialog, no visual flash |
| Landscape orientation on mobile renders without layout overflow |
| Board tap targets are comfortable on a physical mobile device |
| Status text changes are readable at 2–3s intervals — not flickering, not stale |
| Resume prompt shows correct board state (dimmed) when returning to an in-progress game |
| SSE reconnects and restores board correctly after simulated network drop |
