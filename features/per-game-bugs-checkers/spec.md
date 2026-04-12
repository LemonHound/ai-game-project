# Checkers Bug Fixes

**Status: ready**

## Background

Bugs from issue #99. Implement after `ux-game-standardization` and `ai-delay-config` are merged. The server event pacing
(Bug 3) is already resolved by `ai-delay-config`; this spec covers the frontend feedback bugs.

## Bugs

### Bug 1: No visual feedback for forced captures

When a player must capture with only certain pieces, other pieces give no visual indication they are out of play for
this turn.

**Fix**: During the player's turn, if forced capture applies, visually dim/desaturate pieces that cannot be played.
Squares not reachable under the constraint should also be visually subdued.

### Bug 2: Turn indicator not prominent enough

When the bot makes a forced capture that gives the player another consecutive turn, it is not obvious that: (a) it is
the player's turn again, and (b) the player must capture again.

**Fix**: Add a prominent animated indicator (e.g. arrow or pulsing highlight) anchored to the active player's side of
the board. This indicator should be visible any time it is the player's turn.

### Bug 3: AI / server event cadence too fast

Already resolved by the `ai-delay-config` spec. No code changes needed in this PR for pacing. Confirm that the
`GAME_SERVER_MIN_EVENT_INTERVAL_MS` env var is respected by the checkers SSE path (covered by the integration test added
in that spec).

## Scope

- `src/frontend/src/pages/games/CheckersPage.tsx` — forced capture visual dimming, turn indicator
- `src/frontend/src/components/games/CheckersBoard.tsx` — dimming effect on non-playable pieces

## Acceptance Criteria

- During forced capture, pieces that cannot be played this turn appear visually dimmed or desaturated
- A prominent animated turn indicator is visible whenever it is the player's turn
- Server event cadence respects `GAME_SERVER_MIN_EVENT_INTERVAL_MS` (verified by existing ai-delay-config integration
  test)

## Test Cases

| Tier            | Test name                                  | Scenario                                                      |
| --------------- | ------------------------------------------ | ------------------------------------------------------------- |
| Unit (Frontend) | `CheckersBoard > dims non-playable pieces` | When forcedCapturePieces is set, other pieces have dim style  |
| Manual          | Checkers forced capture                    | Only capturable pieces are highlighted; others visually muted |
| Manual          | Checkers turn indicator                    | Animated indicator visible and anchored to player side        |
