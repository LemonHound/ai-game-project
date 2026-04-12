# UX Game Standardization

**Status: implemented**

## Goal

Standardize the player experience loop across all five games. The shared component infrastructure (`GameStartOverlay`, `GameStatsPanel`, `NewGameButtons`) is already in place, but individual game pages have diverged in important behavioral patterns.

## Background

Issues addressed: #96 (partial), #97 (partial), #98 (partial), #99 (partial), #100 (items 1-2).

Issue #100 item 3 (AI difficulty in DB) — **no code change required**. Run directly against psql:
```sql
UPDATE games SET difficulty = 'very_easy';
```

## Patterns to Standardize

### 1. Optimistic Move Display

**Problem**: Only `TicTacToePage.tsx` (lines 202-204) shows the player's move immediately. All other games wait for the SSE bot response before rendering the player's piece.

**Standard**: When a player submits a move, apply it to local board state immediately (optimistic update). If the backend rejects the move, revert to the previous state. This is already the pattern in TicTacToe.

**Affected games**: CheckersPage, ChessPage, Connect4Page, DotsAndBoxesPage

### 2. Game-Start Modal

**Problem**: Issue #100 describes the desired layout — the `GameStartOverlay` should always show 3 options with "Continue Game" disabled (not hidden) when no game exists, and the two "New Game" options side-by-side below with a divider labeled "New Game".

**Current state**: `GameStartOverlay.tsx` already implements this layout. Verify each game page passes `canResume` correctly and that no game uses a custom pre-game modal instead. No structural changes expected — just verification + any drift fixes.

### 3. Game-Over Overlay with New Game Prompt

**Problem**: Games have inconsistent game-over treatment:
- Connect4: Shows "You Win!" / "You Lose" text inline in the board area; has `NewGameButtons` below
- Checkers: Shows result text inline; has `NewGameButtons` below
- Chess: Shows result text inline; has `NewGameButtons` below with immediate color selection
- DotsAndBoxes: Likely similar

**Standard**: When `phase === 'terminal'`, an overlay should appear over the game board with:
- Result text ("You Win!" / "You Lose" / "Draw!")
- A brief pause (300ms) then the `GameStartOverlay` appears (same 3-button layout used at game start, with "Continue Game" disabled since the current game just ended)
- The board remains visible behind the overlay (blurred/dimmed)

Connect4's glowing winning-cells animation should be preserved behind the overlay.

This means the `GameStartOverlay` component serves both start and end-of-game, driven by `phase`.

### 4. Player Banner (GameStatsPanel) Universality

**Problem**: Issue #100 asks us to confirm the player banner component is universal and not customized per-game.

**Finding**: All five games already render `<GameStatsPanel gameType='...' />`. No game-specific customization of this component exists.

**Action**: No code change needed. Document this as confirmed in this spec.

## Scope

Files that will change:
- `src/frontend/src/pages/games/TicTacToePage.tsx` — replace custom newgame/resumeprompt overlays with `GameStartOverlay`; add game-over overlay inside board div
- `src/frontend/src/pages/games/CheckersPage.tsx` — optimistic move display, game-over overlay
- `src/frontend/src/pages/games/ChessPage.tsx` — game-over overlay (optimistic already implemented)
- `src/frontend/src/pages/games/Connect4Page.tsx` — game-over overlay (optimistic already implemented)
- `src/frontend/src/pages/games/DotsAndBoxesPage.tsx` — optimistic move display, game-over overlay
- `src/frontend/src/components/games/GameStartOverlay.tsx` — added optional `title` prop for result text display

Files that should NOT change:
- `GameStatsPanel.tsx` — confirmed universal, no changes
- `NewGameButtons.tsx` — kept as-is; `GameStartOverlay` handles the game-over new-game flow
- Any backend file

## Out of Scope

Per-game specific bugs (chess piece orientation, connect4 column click target, checkers AI timing, etc.) are tracked in `features/per-game-bugs/spec.md`.

## Acceptance Criteria

- All five games show the player's move immediately on submission (before SSE bot response)
- All five games show a game-over overlay using `GameStartOverlay` when `phase === 'terminal'`
- All five games use the standardized `GameStartOverlay` at game start with "Continue Game" disabled (not hidden) when no game to resume
- `GameStatsPanel` is verified universal across all games (no per-game variants)

## Test Cases

| Tier | Test name | Scenario |
|---|---|---|
| Unit (Frontend) | `GameStartOverlay > disables continue when canResume=false` | Continue button present and disabled |
| Unit (Frontend) | `GameStartOverlay > shows start overlay on terminal phase` | Renders overlay in game-over context |
| E2E | `checkers > player move appears immediately` | Place piece, board updates before bot responds |
| E2E | `connect4 > player move appears immediately` | Drop piece, board updates before bot responds |
| E2E | `chess > player move appears immediately` | Move piece, board updates before bot responds |
| E2E | `dots-and-boxes > player move appears immediately` | Draw line, board updates before bot responds |
| E2E | `ttt > game over overlay shown` | Win game, overlay with new-game options appears |
| E2E | `checkers > game over overlay shown` | Win game, overlay with new-game options appears |
| Manual | All 5 games: game start modal | "Continue Game" button disabled initially, enabled after first game saved |
| Manual | All 5 games: game-over overlay | Board visible behind overlay, correct result text |
