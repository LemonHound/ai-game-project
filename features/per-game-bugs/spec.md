# Per-Game Bug Fixes

## Background

Bugs filed in issues #96-#99 from March 28, 2026. Items made obsolete by `features/ux-game-standardization` (game-over overlay, move-shown-immediately) are excluded here. This spec covers only the remaining game-specific bugs.

**Implement after `ux-game-standardization` is merged.**

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

### Bug 4: Board state must use FEN or PGN
**Backend**: The `board_state` column in the chess game table currently stores an arbitrary format. It must store FEN (or PGN) so any move can reconstruct the exact board state without reading prior moves.

**Fix**: Ensure each move stored in the DB includes the FEN string for that position. Update move serialization and deserialization accordingly.

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

### Bug 3: AI move delay too fast
The AI responds almost instantly (~20ms), well below the 2-3 second enqueue/dequeue delay specified in the checkers spec.

**Fix**: Verify the `MOVE_DELAY_MS` / throttling configuration in the backend checkers strategy or SSE handler. The delay between a player's move completing and the bot's response appearing should be 2000-3000ms (with a "thinking..." indicator during the wait).

---

## Scope

- `src/frontend/src/pages/games/Connect4Page.tsx` — column click zone, hover preview
- `src/frontend/src/pages/games/DotsAndBoxesPage.tsx` — box fill icons, button alignment
- `src/frontend/src/pages/games/ChessPage.tsx` — board orientation, piece images, captures panel, FEN, AN, layout
- `src/frontend/src/components/games/ChessBoard.tsx` — piece rendering
- `src/frontend/src/pages/games/CheckersPage.tsx` — forced capture visual, turn indicator
- Backend checkers SSE/strategy — AI timing delay
- Backend chess game persistence — FEN board state

## Acceptance Criteria

- Connect4: clicking anywhere in a column drops a piece; hovering shows a preview
- DotsAndBoxes: claimed boxes show player/AI icon; buttons centered
- Chess: player's pieces at bottom; piece images rendered; captures shown as icons; board state stored as FEN; move list shows AN; page never scrolls
- Checkers: inactive pieces visually dimmed during forced capture; turn indicator visible; bot delay 2-3 seconds

## Test Cases

| Tier | Test name | Scenario |
|---|---|---|
| Unit (Frontend) | `Connect4Board > column click triggers drop` | Click column body fires onColumnClick |
| Unit (Frontend) | `Connect4Board > hovered column shows preview` | hoveredCol state renders preview piece |
| Unit (Frontend) | `ChessBoard > renders piece images not letters` | piece element is an img, not text |
| Unit (Frontend) | `ChessBoard > flips board for black player` | rank 1 appears at top when playerColor=white, bottom when playerColor=black |
| Unit (Python) | `test_chess_move_stores_fen` | After each move, board_state is a valid FEN string |
| Unit (Python) | `test_checkers_ai_delay` | Bot SSE event is emitted >= 2000ms after player move |
| API | `test_chess_move_response_has_algebraic_notation` | Move response includes AN string |
| Manual | Checkers forced capture | Only capturable pieces are highlighted |
| Manual | Chess layout | No scrollbar at 1280×800 viewport with 10+ moves and captures on both sides |
