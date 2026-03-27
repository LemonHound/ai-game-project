# Game: Dots and Boxes

**Status: ready**

## Background

Backend game logic is fully implemented in `src/backend/game_logic/dots_and_boxes.py`. REST API exists at
`/api/game/dots-and-boxes/start` and `/api/game/dots-and-boxes/move`. The React page at
`src/frontend/src/pages/games/DotsAndBoxesPage.tsx` is currently a stub. This spec supersedes the Dots and
Boxes section of the react-migration Phase 3 spec.

## Known Requirements

- **Mobile + desktop responsive**: line segments between dots must have tap targets large enough for mobile use;
  game board is the primary focus above the fold; claimed box scores and turn indicator stack below on small
  viewports
- Connect to existing backend REST API for game start and moves
- Move transport (REST vs. WebSocket) is an open question pending the websocket feature spec — see
  `features/websocket/`
- When the game-data-persistence feature is complete, session data capture must be integrated
- **Frontend move validation**: the React client validates moves in real time (e.g., line already drawn) —
  UX layer only, not a security boundary
- **Backend move validation (player)**: backend re-validates every player move server-side as redundancy
  against frontend manipulation
- **Backend move validation (AI)**: backend validates every AI-generated move; if invalid, retries until a
  valid move is produced (configurable retry limit); client always receives a guaranteed-valid AI move

## Open Questions

### Gameplay
- Should unauthenticated users be able to play, or is login required?
- What grid size(s) are supported? (The backend may have a fixed size — needs verification)
- What difficulty levels are surfaced to the user?
- Session recovery on page refresh?

### UI / UX
- How are line segments rendered: SVG, canvas, or CSS grid?
- Mobile interaction model: tap between two dots to draw a line, or tap-and-drag?
- How are claimed boxes visually distinguished (color, initials, fill)?
- AI turn indicator / thinking animation?
- Score display: running total per turn, or only shown at end?
- Win/loss outcome: modal, inline, or results screen?

### Stats & Persistence
- Win/loss/draw stats on the game page? (Depends on game-data-persistence feature)

## Test Cases

_To be defined during planning session._
