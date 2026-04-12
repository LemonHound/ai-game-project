# Connect 4 Bug Fixes

**Status: ready**

## Background

Bugs from issue #97. Implement after `ux-game-standardization` and `ai-delay-config` are merged.

## Bugs

### Bug 1: Column click target too narrow

Clicking on the board column body does nothing; only the small arrow button above the column works.

**Fix**: Make each column a clickable drop zone. The `onClick` handler should fire for clicks anywhere in the column,
not only on the arrow button.

### Bug 2: No column hover preview

Hovering over a column (or its button) should show a preview piece at the top of that column with reduced opacity,
matching the player's color.

**Fix**: Track `hoveredCol` state. When hovering, render a preview piece (50% opacity) in the top cell of that column if
the column is not full and the game is in the player's turn.

## Scope

- `src/frontend/src/pages/games/Connect4Page.tsx` — column click zone, hover preview

## Acceptance Criteria

- Clicking anywhere in a column drops a piece (not only the arrow button)
- Hovering a column shows a 50% opacity preview piece at the top when it is the player's turn and the column is not full

## Test Cases

| Tier            | Test name                                      | Scenario                                      |
| --------------- | ---------------------------------------------- | --------------------------------------------- |
| Unit (Frontend) | `Connect4Board > column click triggers drop`   | Click column body fires onColumnClick         |
| Unit (Frontend) | `Connect4Board > hovered column shows preview` | hoveredCol state renders preview piece        |
| E2E             | `connect4 > drop piece by clicking column`     | Click column body, piece lands in correct row |
