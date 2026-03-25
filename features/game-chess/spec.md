# Game: Chess

## Background

Backend game logic is fully implemented in `src/backend/game_logic/chess.py`, including piece movement,
castling, and en passant. The existing `src/frontend/public/js/basic-chess-ai.js` (~39KB minimax) and
`chess-evaluation.js` are legacy client-side files from the pre-React implementation. REST API exists at
`/api/game/chess/start`, `/api/game/chess/move`, `/api/game/chess/session/{id}`. The React page at
`src/frontend/src/pages/games/ChessPage.tsx` is currently a stub. This spec supersedes the Chess section of
the react-migration Phase 3 spec.

Chess is the most complex game in the set and should be implemented last.

## Known Requirements

- **Mobile + desktop responsive**: 8x8 board must render at a playable size on mobile without overflow; piece
  tap targets must be large enough; game board is the primary focus above the fold; captured pieces, move
  history, and controls stack below or in a collapsible panel on small viewports
- Connect to backend REST API for game start and moves
- Move transport (REST vs. WebSocket) is an open question pending the websocket feature spec — see
  `features/websocket/`
- When the game-data-persistence feature is complete, session data capture must be integrated
- **Frontend move validation**: the React client validates moves in real time to block illegal inputs before
  they are submitted — this is a UX layer, not a security boundary
- **Backend move validation (player)**: the backend re-validates every player move server-side as a redundancy
  against frontend manipulation
- **Backend move validation (AI)**: the backend validates every AI-generated move; if invalid, it rates the
  move and retries the AI logic until a valid move is produced (up to a configurable retry limit); the client
  always receives a guaranteed-valid AI move
- The legacy `basic-chess-ai.js` and `chess-evaluation.js` files are to be removed as part of Phase 4 cleanup;
  AI logic runs server-side only

## Open Questions

### Gameplay
- Should unauthenticated users be able to play, or is login required?
- Player color selection (white vs. black)?
- What difficulty levels map to which search depths?
- Check / checkmate / stalemate detection: is this fully handled by the backend, or does the frontend need to
  detect any of these?
- En passant and castling: are these fully handled by the backend API, or does the frontend need special logic?
- Promotion: how is pawn promotion handled — automatic queen, or player choice?
- Session recovery on page refresh?

### UI / UX
- Move selection model: tap piece to select, tap destination to move — or drag-and-drop?
- How are valid moves highlighted on piece selection?
- Move history / notation panel (algebraic notation)?
- Captured pieces display?
- AI "thinking" indicator (chess AI can be slow at deeper depths)?
- Win/loss/draw/stalemate outcome display?

### Stats & Persistence
- Win/loss/draw stats on the game page? (Depends on game-data-persistence feature)
- Should move history be persisted for game replay?

## Test Cases

_To be defined during planning session._
