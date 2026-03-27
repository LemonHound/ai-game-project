# Game: Tic-Tac-Toe

**Status: ready**

## Background

Backend game logic is fully implemented in `src/backend/game_logic/tic_tac_toe.py`. REST API exists at
`/api/game/tic-tac-toe/start`, `/api/game/tic-tac-toe/move`, `/api/game/tic-tac-toe/session/{id}`. The React
page at `src/frontend/src/pages/games/TicTacToePage.tsx` is currently a stub. This spec supersedes the
Tic-Tac-Toe section of the react-migration Phase 3 spec.

## Known Requirements

- **Mobile + desktop responsive**: board cells must be large enough to tap on small screens; game board is the
  primary focus above the fold on mobile; status/controls stack below on small viewports
- Connect to existing backend REST API for game start and moves
- Move transport (REST vs. WebSocket) is an open question pending the websocket feature spec — see
  `features/websocket/`
- When the game-data-persistence feature is complete, session data capture must be integrated
- **Frontend move validation**: the React client validates moves in real time to block illegal inputs before
  submission — UX layer only, not a security boundary
- **Backend move validation (player)**: backend re-validates every player move server-side as redundancy
  against frontend manipulation
- **Backend move validation (AI)**: backend validates every AI-generated move; if invalid, retries until a
  valid move is produced (configurable retry limit); client always receives a guaranteed-valid AI move

## Open Questions

### Gameplay
- Should unauthenticated users be able to play, or is login required to start a game?
- Can the player choose to play as X or O (i.e., go first or second)?
- What difficulty levels are exposed to the user? (The backend supports a `difficulty` param)
- What happens on page refresh mid-game — is session recovery in scope?

### UI / UX
- How is difficulty selection presented? (Pre-game modal, settings panel, inline selector?)
- Should there be an AI "thinking" indicator between the player's move and the AI response?
- Win/draw/loss outcome: modal overlay, inline banner, or redirect to a results screen?
- Should the player be able to restart without navigating away?

### Stats & Persistence
- Should win/loss/draw stats be displayed on the game page? (Depends on game-data-persistence feature)
- Are stats shown for the current session only, or all-time?

## Test Cases

_To be defined during planning session._
