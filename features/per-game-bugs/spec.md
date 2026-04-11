# Per-Game Bug Fixes

## Background

Bugs filed in issues #96-#99 from March 28, 2026. Items made obsolete by `features/ux-game-standardization` (game-over overlay, move-shown-immediately) are excluded here. This spec covers only the remaining game-specific bugs.

**Implement after `ux-game-standardization` is merged.**

---

## Global conventions (all games)

### Move history and exports

Canonical per-session move storage remains the append-only **`move_list`** (or equivalent) in standard notation for each game (chess: SAN). Do **not** treat a growing stored PGN blob as the source of truth. **Regenerate** presentation or export strings (e.g. full chess PGN with headers) from `move_list` plus session metadata whenever consumers need them (UI snapshots, DS pipelines, downloads). The same pattern applies elsewhere: derive long-form text from the move array rather than persisting redundant cumulative strings.

### Chess snapshot vs training

- **`board_state`**: after each applied move, store a **valid FEN** for the current position (instant resume and validation).
- **`move_list`**: **SAN** per half-move, append-only (human-readable move list and ML-friendly replay).
- **PGN for data science**: build with the existing PGN helper from accumulated SAN plus headers and result when a PGN string is required; regeneration is the supported path.

### Server pacing between emitted events

All games use one **global minimum delay** between consecutive **server-emitted** game events (SSE steps, AI segments, etc.), regardless of older per-game millisecond values in individual specs.

- **Configuration**: single environment variable (e.g. `GAME_SERVER_MIN_EVENT_INTERVAL_MS`) in local, test, and GCP (Secret Manager or runtime env). **Prod** sets the product default (on the order of 2–3 seconds where that was previously specified). **Local and CI** set `0` or a small value for speed; tests that assert pacing set the variable explicitly for that case.
- **Implementation**: enforce in the **central** scheduler or emit path used by game SSE (not only checkers), so every game’s outbound cadence respects the same floor.
- **Observability**: at startup or on first scheduled emit, **log** the resolved interval and its source (default vs env). Record the same in **OpenTelemetry** attributes where spans already cover game moves, so misconfiguration is visible in GCP.

### Optimistic UI: animation vs rejection

When the client applies a move **optimistically**, piece or token **animations run** toward the optimistic placement. If the **server rejects** the move, **do not** play that animation to completion as if it succeeded: replace the view with the **authoritative `board_state`** immediately and surface a **user-visible error** (toast, inline alert, or existing error component). No celebratory or “commit” animation for rejected moves.

### Explicitly not in scope

- **Premove** (chess, checkers, or any game): omitted due to rules complexity, sync with AI, and test surface.
- **Checkers multi-jump “plan full path then execute”** and **piece move polish** beyond the bug list: desirable follow-ups; not required to close this spec. If implemented later, chain visualization and server validation of the full jump sequence must be specified separately.

---

## Games Page Labels (GamesPage.tsx)

Three display problems on `/games`:

### Bug 1: Difficulty label has no context
`Very Easy` is shown in a badge with no explanation. Updated to **`AI Difficulty: Very Easy`**.

### Bug 2: Player count badge is useless
`1` is displayed in a badge. All games are 1-player (human vs bot) by definition on this site. Badge removed.

### Bug 3: "Coming Soon" applied to fully playable games
Five games showed "Coming Soon" despite being fully functional. The label should only apply to Pong (the game itself is not yet implemented). For all other games, the AI model has not been integrated yet but the game is fully playable — show **`No AI Yet`** instead (styled as a warning badge to distinguish from the neutral "Coming Soon").

### Implementation status
**Already implemented** — `src/frontend/src/pages/GamesPage.tsx` updated:
- `PLACEHOLDER_GAMES` tags cleaned up (removed "1 Player", "Coming Soon" → "No AI Yet" for non-pong)
- Difficulty badge prefixed with "AI Difficulty:"
- Players badge removed from render
- "No AI Yet" renders as `badge-warning badge-outline`

### DB update required (Kevin to run)
The `games` table in PostgreSQL also stores these fields. Run the following after confirming the frontend changes look correct:

```sql
-- Non-pong: remove '1 Player' and 'Coming Soon', add 'No AI Yet'
UPDATE games
SET tags = array_append(
    array_remove(array_remove(tags, '1 Player'), 'Coming Soon'),
    'No AI Yet'
)
WHERE id != 'pong';

-- Pong: remove '1 Player' only, keep 'Coming Soon'
UPDATE games
SET tags = array_remove(tags, '1 Player')
WHERE id = 'pong';
```

---

## Connect 4 (#97)

### Bug 1: Column click target too narrow
Clicking on the board column body does nothing; only the small arrow button above the column works.

**Fix**: Make each column a clickable drop zone. The `onClick` handler should fire for clicks anywhere in the column, not only on the arrow button.

### Bug 2: No column hover preview
Hovering over a column (or its button) should show a preview piece at the top of that column with reduced opacity, matching the player's color.

**Fix**: Track `hoveredCol` state. When hovering, render a preview piece (50% opacity) in the top cell of that column if the column is not full and the game is in the player's turn.

---

## Dots and Boxes (#96)

### Bug 1: Box fill icon
When a player or AI claims a box, the box should show the claimer's icon in the center — use the player avatar icon and a bot icon, not a plain color fill.

### Bug 2: Button alignment
"Go first" / "Go second" buttons are slightly off-center to the left. Fix alignment.

---

## Chess (#98)

### Bug 1: Player color at bottom
The player's pieces are always rendered at the top of the board regardless of which color they chose. The player's color must always appear at the bottom (standard chess orientation).

**Fix**: When rendering the board, flip the rank/file indices when the player is playing Black.

### Bug 2: Piece images not used
Piece icons are showing as letters. Chess piece SVGs/PNGs exist in `/src/frontend/public/images/`. Use them.

**Fix**: Replace the letter fallback with `<img>` tags pointing to the correct image for each piece type and color.

### Bug 3: Captured pieces should use piece images
The captured pieces shown in the panel currently display as letters. Use the same scaled-down piece images from Bug 2.

**Fix**: Render captured piece images at ~60% size of board pieces, grouped by piece type.

### Bug 4: Board state and notation for resume, UI, and analysis
**Backend**: `board_state` must be a **valid FEN** string after every persisted move (replace arbitrary JSON shapes). **`move_list`** holds **SAN** half-moves only (append-only). For consumers that need a **PGN document**, **regenerate** it from `move_list` plus session metadata (player names, date, result); do not store an authoritative growing PGN column. Reconstruction from an arbitrary ply remains: replay `move_list` from the start through that ply (fast for typical game length), with current position always available from latest FEN in `board_state`.

**Fix**: Normalize chess persistence to FEN + SAN; wire PGN generation at export/API boundaries where the DS pipeline or downloads need the full string.

### Bug 5: Move notation must be Algebraic Notation
The move list currently shows raw coordinate pairs (e.g., `e2-e4`). Display Standard Algebraic Notation (e.g., `e4`, `Nf3`, `O-O`).

### Bug 6: Layout scrolls when move list is long
The page should never require vertical scrolling. When the move list grows, it should scroll internally within a fixed-height container. Captured pieces panels and board layout must stay on screen at all viewport sizes.

**Fix**: Give the move list and captures panels `overflow-y: auto` with `max-height` computed from the board height. Board height stays fixed.

---

## Checkers (#99)

### Bug 1: No visual feedback for forced captures
When a player must capture with only certain pieces, the other pieces give no visual indication they're out of play.

**Fix**: During the player's turn, if forced capture applies, apply a visual dimming/desaturation effect to pieces that cannot be played this turn. Squares not reachable in this constraint should also be visually subdued.

### Bug 2: Turn indicator not prominent enough
When the bot makes a forced capture that gives the player another consecutive turn, it's not obvious that:
(a) it's the player's turn again, and
(b) the player must capture again.

**Fix**: Add a prominent animated indicator (e.g., an arrow or pulsing highlight) anchored to the active player's side of the board. This indicator should be visible any time it's the player's turn.

### Bug 3: AI / server event cadence too fast
The bot or server can emit the next step almost instantly (~20ms), which feels wrong versus the intended human-paced cadence.

**Fix**: Apply the **global** minimum interval between server-emitted game events (see Global conventions). Checkers must respect the same central pacing as other games. Client continues to show a “thinking…” style indicator during enforced waits where applicable.

---

## Scope

- `src/frontend/src/pages/games/Connect4Page.tsx` — column click zone, hover preview
- `src/frontend/src/pages/games/DotsAndBoxesPage.tsx` — box fill icons, button alignment
- `src/frontend/src/pages/games/ChessPage.tsx` — board orientation, piece images, captures panel, FEN, AN, layout; optimistic animation vs rejection behavior per Global conventions
- `src/frontend/src/components/games/ChessBoard.tsx` — piece rendering
- `src/frontend/src/pages/games/CheckersPage.tsx` — forced capture visual, turn indicator
- Backend game SSE / `MoveProcessor` (or shared emit scheduler) — **global** minimum interval between emitted events; remove reliance on ad hoc per-game hardcoded delays where they conflict
- Backend chess game persistence — FEN in `board_state`, SAN in `move_list`, PGN regenerated when needed

## Acceptance Criteria

- Connect4: clicking anywhere in a column drops a piece; hovering shows a preview
- DotsAndBoxes: claimed boxes show player/AI icon; buttons centered
- Chess: player's pieces at bottom; piece images rendered; captures shown as icons; `board_state` is FEN; move list shows SAN; PGN can be regenerated from stored moves; page never scrolls
- Checkers: inactive pieces visually dimmed during forced capture; turn indicator visible; time between server-emitted steps respects the configured global minimum (prod default in the 2–3 second range where specified)
- All SSE-backed games: outbound event spacing respects the same global minimum; rejected optimistic moves snap to server state with a user-visible error and **no** success animation

## Test Cases

| Tier | Test name | Scenario |
|---|---|---|
| Unit (Frontend) | `Connect4Board > column click triggers drop` | Click column body fires onColumnClick |
| Unit (Frontend) | `Connect4Board > hovered column shows preview` | hoveredCol state renders preview piece |
| Unit (Frontend) | `ChessBoard > renders piece images not letters` | piece element is an img, not text |
| Unit (Frontend) | `ChessBoard > flips board for black player` | rank 1 appears at top when playerColor=white, bottom when playerColor=black |
| Unit (Python) | `test_chess_move_stores_fen` | After each move, board_state is a valid FEN string |
| Unit (Python) | `test_game_server_min_event_interval` | With `GAME_SERVER_MIN_EVENT_INTERVAL_MS=2000`, next server-emitted game event after a player move is not sent before 2000ms elapsed (checkers or representative SSE game) |
| Unit (Python) | `test_chess_pgn_regenerated_from_moves` | Given SAN `move_list` and metadata, regenerated PGN string matches expected movetext/headers |
| API | `test_chess_move_response_has_algebraic_notation` | Move response includes AN string |
| Unit (Frontend) | `optimisticMoveRejectedSnapsState` | On move error response, board matches server payload and error UI is shown; no completion animation for the rejected path |
| Manual | Checkers forced capture | Only capturable pieces are highlighted |
| Manual | Chess layout | No scrollbar at 1280×800 viewport with 10+ moves and captures on both sides |
