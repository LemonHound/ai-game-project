# Game: Checkers

## Background

Backend game logic is fully implemented in `src/backend/game_logic/checkers.py`, including king promotion and
jump validation. REST API exists at `/api/game/checkers/start` and `/api/game/checkers/move`. The React page
at `src/frontend/src/pages/games/CheckersPage.tsx` is currently a stub. This spec supersedes the Checkers
section of the react-migration Phase 3 spec.

## Known Requirements

- **Mobile + desktop responsive**: 8x8 board must render cleanly on small screens; piece tap targets must be
  large enough for mobile; game board is the primary focus above the fold; controls and status stack below
- Connect to existing backend REST API for game start and moves
- Move transport (REST vs. WebSocket) is an open question pending the websocket feature spec — see
  `features/websocket/`
- When the game-data-persistence feature is complete, session data capture must be integrated
- **Frontend move validation**: the React client validates moves in real time (legal piece selection, valid
  destinations) — UX layer only, not a security boundary
- **Backend move validation (player)**: backend re-validates every player move server-side as redundancy
  against frontend manipulation
- **Backend move validation (AI)**: backend validates every AI-generated move; if invalid, retries until a
  valid move is produced (configurable retry limit); client always receives a guaranteed-valid AI move

## Open Questions

### Gameplay
- Should unauthenticated users be able to play, or is login required?
- Player color selection (red vs. black / first vs. second)?
- What difficulty levels are surfaced to the user?
- Multi-jump sequences: does the UI handle chained jumps in a single turn, or does the backend handle that?
- Session recovery on page refresh?

### UI / UX
- Move selection model: tap piece to select, tap destination to move — or drag-and-drop?
- How are valid moves highlighted on piece selection?
- King promotion visual indicator?
- AI "thinking" indicator between moves?
- Win/loss outcome: modal, inline banner, or results screen?

### Stats & Persistence
- Win/loss stats on the game page? (Depends on game-data-persistence feature)

## Test Cases

_To be defined during planning session._
