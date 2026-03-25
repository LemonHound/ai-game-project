# Game: Connect 4

## Background

Backend game logic is fully implemented in `src/backend/game_logic/connect4.py`. REST API exists at
`/api/game/connect4/start`, `/api/game/connect4/move`, `/api/game/connect4/ai-first`,
`/api/game/connect4/session/{id}`. The backend also supports an AI-first-move endpoint. The React page at
`src/frontend/src/pages/games/Connect4Page.tsx` is currently a stub. This spec supersedes the Connect 4
section of the react-migration Phase 3 spec.

## Known Requirements

- **Mobile + desktop responsive**: 7-column grid must render without horizontal overflow on small screens;
  column drop targets must be large enough to tap; game board is the primary focus above the fold on mobile
- Connect to existing backend REST API for game start, AI-first-move, and player moves
- Move transport (REST vs. WebSocket) is an open question pending the websocket feature spec — see
  `features/websocket/`
- When the game-data-persistence feature is complete, session data capture must be integrated
- **Frontend move validation**: the React client validates moves in real time (e.g., column full check) —
  UX layer only, not a security boundary
- **Backend move validation (player)**: backend re-validates every player move server-side as redundancy
  against frontend manipulation
- **Backend move validation (AI)**: backend validates every AI-generated move; if invalid, retries until a
  valid move is produced (configurable retry limit); client always receives a guaranteed-valid AI move

## Open Questions

### Gameplay
- Should unauthenticated users be able to play, or is login required?
- Player color selection (red vs. yellow / first vs. second)?
- The backend supports an `ai-first` endpoint — how is this exposed in the UI? (Toggle before starting?)
- What difficulty levels are surfaced to the user?
- Session recovery on page refresh?

### UI / UX
- Column selection method on mobile: tap the column, or tap a drop zone above the board?
- AI "thinking" indicator between moves?
- Win detection highlight: animate the winning four pieces?
- Restart without navigating away?

### Stats & Persistence
- Win/loss/draw stats on the game page? (Depends on game-data-persistence feature)

## Test Cases

_To be defined during planning session._
