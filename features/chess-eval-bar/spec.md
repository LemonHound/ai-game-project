# Chess Eval Bar (client-side Stockfish)

**Status: planned**

## Background

The chess game has no position evaluation in the UI. The board is server-authoritative: the
frontend holds an 8x8 piece array, legal moves and validation come from the backend
(`/api/game/chess/...`), and the CNN opponent's moves arrive over SSE. There is no client-side
chess engine today (no `chess.js`, no `onnxruntime-web`, no web workers, no WASM, no COOP/COEP
headers).

We want a vertical evaluation bar beside the board that updates live each move, driven by
Stockfish running entirely in the browser. Running the engine client-side keeps it free of server
load and makes it an innate part of the chess page.

## Decisions

These were settled during brainstorming:

- **Scope: eval bar only.** A vertical white/black advantage bar with a numeric label. No
  multi-PV, no best-move arrows, no principal-variation text, no line navigation.
- **Engine: single-threaded Stockfish WASM.** No `SharedArrayBuffer`, therefore no cross-origin
  isolation (COOP/COEP) and no site-wide header change. Lower risk than the threaded NNUE build.
- **When: live during play.** The bar updates after every confirmed position (initial state,
  player move, AI move). This is intentionally a real-time strength aid while playing the bot.

## Scope

### FEN source

The backend already computes an authoritative FEN every move. `chess_engine.py` sets
`gs["fen"] = self._to_fen(gs)` after `apply_move`, and the persisted `board_state` JSONB carries a
`fen` key. The resume endpoint returns raw `board_state` (so it already includes `fen`), but the
SSE move payload builder `_chess_state_payload` constructs an explicit dict that omits it, and no
frontend type models `fen`.

The client therefore needs the FEN surfaced on the payloads it already receives. We reuse the
server's python-chess FEN rather than adding any client-side chess logic.

### Files changed

| File | Change |
| --- | --- |
| `src/backend/games.py` | `_chess_state_payload` adds `"fen": state.get("fen")`. Ensure a new game's initial state carries a FEN (default to the start-position FEN when `fen` is unset, e.g. player-to-move-first games before any move). |
| `src/frontend/src/api/chess.ts` | Add `fen?: string` to `ChessGameState` and `ChessMoveData`. |
| `src/frontend/public/engine/` | Vendored single-threaded Stockfish WASM build plus its JS loader. Served statically; lazy-loaded on the chess route only. |
| `src/frontend/src/workers/stockfish.worker.ts` | Thin worker that loads the engine and relays UCI text in/out. |
| `src/frontend/src/lib/uci.ts` | Parse UCI `info` lines into `{ depth, scoreCp, mate }`. Pure. |
| `src/frontend/src/lib/evalScore.ts` | Map score (cp or mate) to a 0..1 White-advantage fill via a logistic curve, plus a display label (`+1.4`, `M3`). Pure. |
| `src/frontend/src/hooks/useStockfishEval.ts` | Own the worker lifecycle; on each new FEN cancel the running search and start a new one; expose `{ cp, mate, depth, ready }`. |
| `src/frontend/src/components/games/EvalBar.tsx` | The vertical bar. |
| `src/frontend/src/pages/games/ChessPage.tsx` | Track `currentFen` from initial state, `player_move`, and `move`; render `<EvalBar>` beside `<ChessBoard>`. |

### Data flow

1. Backend surfaces `fen` on the payloads the client already gets.
2. `ChessPage` updates `currentFen` from the initial game state and from each SSE `player_move` and
   `move` event.
3. `useStockfishEval(currentFen)` posts to the worker: on a new FEN, send `stop`, then
   `position fen <fen>`, then `go` (fixed `movetime` ~400-600ms, or `go depth 14`). It parses each
   `info` line and keeps the latest `{ depth, scoreCp, mate }`.
4. `EvalBar` renders the score as a vertical fill on the left edge of the board, oriented to the
   board's current perspective (flips when the board flips for the black player).

### Engine specifics

- Single-threaded build only (no `SharedArrayBuffer`). Recommended: Stockfish 16.1 single-threaded
  NNUE for strength; the smaller HCE build is an acceptable fallback if asset size is a concern.
- The engine is initialized once and kept warm. Each new position cancels the prior search with
  `stop` before issuing `go`.
- Lazy-load the engine module on the chess route so it never enters the main bundle.
- `.wasm` must be served with `Content-Type: application/wasm`. Verify both the Vite dev server and
  the production FastAPI `StaticFiles` mount serve the correct MIME.

### Score to bar mapping

- Centipawns map to a 0..1 White win-probability through a logistic curve, clamped at roughly
  +/-10 pawns.
- A mate score pins the bar fully toward the mating side.
- The numeric label shows pawn-unit advantage (`+1.4`) or mate distance (`M3`), from White's
  perspective.
- Scores from the engine are relative to the side to move; normalize to White before mapping.

### Edge cases

- Engine fails to load or the browser cannot instantiate the WASM: hide the bar; the game is
  unaffected.
- Position before any move exists: default to the start-position FEN.
- Rapid consecutive moves: always `stop` before the next `go` so only the current position is
  searched.
- Game over: freeze the final evaluation.

## Known Requirements

- No change to game logic, move validation, or existing SSE event types. The only server change is
  adding the `fen` field to the chess move payload and ensuring the initial state has one.
- No COOP/COEP headers and no cross-origin isolation. If a future change requires the threaded
  engine, that is a separate spec.
- The engine assets and worker load only on the chess page, not site-wide.
- TypeScript: exported functions and the `EvalBar` component carry JSDoc per repo convention.

## Out of scope

Multi-PV, best-move arrows, principal-variation text, line navigation, the threaded NNUE engine,
backend `/api/ml/chess/analyze` integration, and persisting evaluations.

## Test Cases

| Tier | Name | What it checks |
| --- | --- | --- |
| Unit | `test_chess_state_payload_includes_fen` | `_chess_state_payload` output contains a `fen` key matching the state's FEN |
| Unit | `test_chess_newgame_state_has_fen` | A new game's initial state carries a valid FEN (start position when player moves first) |
| Unit (Vitest) | `uci.parsesInfoScoreAndDepth` | `parseInfo` extracts `depth`, `scoreCp`, and `mate` from representative `info` lines, including mate scores |
| Unit (Vitest) | `evalScore.cpToFill` | Centipawn-to-fill is monotonic, clamps at the bounds, and `0` maps to `0.5` |
| Unit (Vitest) | `evalScore.mateToFill` | A mate score pins the fill fully toward the mating side and labels `M<n>` |
| Unit (Vitest) | `evalScore.normalizesSideToMove` | A score for Black to move is normalized to White before mapping |
| Component (Vitest) | `EvalBar.rendersFillAndOrientation` | Given a score and perspective, the bar fill height and orientation are correct, and flip with perspective |
| Component (Vitest) | `useStockfishEval.cancelsOnNewFen` | With a fake worker emitting canned UCI lines, a new FEN triggers `stop` then `position`/`go`, and the latest score is exposed |
| Manual | Live eval | On the running chess page the bar appears, shows a sensible eval at the start, and updates after each player and AI move |
| Manual | Graceful absence | With the engine asset removed or blocked, the chess page still loads and plays; the bar is simply hidden |
