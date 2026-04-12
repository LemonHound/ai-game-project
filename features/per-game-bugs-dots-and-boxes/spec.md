# Dots and Boxes Bug Fixes

**Status: implemented**

## Background

Bugs from issue #96. Implement after `ux-game-standardization` is merged.

## Bugs

### Bug 1: Box fill icon

When a player or AI claims a box, the box should show the claimer's icon in the center — use the player avatar icon and
a bot icon, not a plain color fill.

### Bug 2: Button alignment

"Go first" / "Go second" buttons are slightly off-center to the left. Fix alignment.

## Scope

- `src/frontend/src/pages/games/DotsAndBoxesPage.tsx` — button alignment
- `src/frontend/src/components/games/DotsAndBoxesBoard.tsx` — box fill icon rendering

## Acceptance Criteria

- Claimed boxes display the player avatar icon or a bot icon centered in the box cell
- "Go first" / "Go second" buttons are horizontally centered

## Test Cases

| Tier            | Test name                                        | Scenario                                             |
| --------------- | ------------------------------------------------ | ---------------------------------------------------- |
| Unit (Frontend) | `DotsAndBoxesBoard > claimed box renders icon`   | Box element contains img/icon, not only a color fill |
| E2E             | `dots-and-boxes > claimed box shows player icon` | After claiming a box, icon appears in the cell       |
