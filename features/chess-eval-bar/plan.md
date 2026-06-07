# Chess Eval Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a vertical Stockfish evaluation bar beside the chess board that updates live each move, with Stockfish running single-threaded in the browser.

**Architecture:** The backend already computes an authoritative FEN every move; we surface it on the payloads the client already receives. `ChessPage` tracks the current FEN and feeds it to a `useStockfishEval` hook that drives a single-threaded Stockfish WASM worker over UCI, cancelling the prior search on each new position. An `EvalBar` component renders the White-relative score beside the board.

**Tech Stack:** FastAPI/python-chess (backend), React 19 + TypeScript + Vite, Vitest + Testing Library (frontend tests), pytest (backend tests), single-threaded Stockfish 16 NNUE WASM.

---

## Conventions for this plan

- **Working directory:** all commands run from the website repo root `ai-game-project/`. The branch `feat/chess-eval-bar` is already checked out.
- **No comments, no JSDoc.** Per the user's global style rule. The repo's `jsdoc/require-jsdoc` lint error only targets `FunctionDeclaration`/`MethodDefinition`/`ClassDeclaration`, so every exported TS symbol in this plan is an **arrow-function const** (exempt from the rule). Do not add docstrings.
- **Formatting:** before each frontend commit, run `npm run format` (Prettier: 4-space indent, single quotes, semicolons, trailing commas) then `npm run lint`.
- **pytest:** commands below use `python` (Windows dev). CI and the repo scripts use `python3`; substitute if on macOS/Linux.
- **Commit messages:** concise, imperative, no attribution lines.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/backend/game_engine/chess_engine.py` (modify) | `initial_state` sets `fen` from `_to_fen` so a fresh game carries a FEN. |
| `src/backend/games.py` (modify) | `_chess_state_payload` adds `"fen"` to the serialized move/state payload. |
| `tests/unit/test_chess_eval_fen.py` (create) | Unit tests for the two backend changes. |
| `src/frontend/src/lib/uci.ts` (create) | `parseInfo`: parse a UCI `info` line into `{ depth, scoreCp, mate }`. Pure. |
| `src/frontend/src/lib/uci.test.ts` (create) | Tests for `parseInfo`. |
| `src/frontend/src/lib/evalScore.ts` (create) | `normalizeToWhite`, `cpToWhiteFill`, `whiteFill`, `formatEval`. Pure. |
| `src/frontend/src/lib/evalScore.test.ts` (create) | Tests for the score helpers. |
| `src/frontend/public/engine/` (create) | Vendored single-threaded Stockfish NNUE WASM + JS, served statically. |
| `src/frontend/src/lib/stockfishEngine.ts` (create) | `UciEngine` interface + `createStockfishEngine` (real Worker). Browser glue, no unit test. |
| `src/frontend/src/hooks/useStockfishEval.ts` (create) | Owns the engine, cancels on new FEN, exposes White-relative `{ cp, mate, depth, ready }`. |
| `src/frontend/src/hooks/useStockfishEval.test.ts` (create) | Hook tests with an injected fake engine. |
| `src/frontend/src/components/games/EvalBar.tsx` (create) | The vertical bar. |
| `src/frontend/src/components/games/EvalBar.test.tsx` (create) | Component tests. |
| `src/frontend/src/api/chess.ts` (modify) | Add `fen?: string` to `ChessGameState` (inherited by `ChessMoveData`). |
| `src/frontend/src/pages/games/ChessPage.tsx` (modify) | Track `currentFen`; render `<EvalBar>` beside `<ChessBoard>`. |

---

## Task 1: Backend surfaces the FEN

**Files:**
- Modify: `src/backend/game_engine/chess_engine.py` (`initial_state`, around lines 102-127)
- Modify: `src/backend/games.py` (`_chess_state_payload`, around lines 1121-1153)
- Test: `tests/unit/test_chess_eval_fen.py`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/test_chess_eval_fen.py`:

```python
from game_engine.chess_engine import ChessEngine


def test_chess_initial_state_has_startpos_fen():
    state = ChessEngine().initial_state(player_starts=True)
    fields = state["fen"].split(" ")
    assert fields[0] == "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"
    assert fields[1] == "w"


def test_chess_state_payload_includes_fen():
    import games

    state = ChessEngine().initial_state(player_starts=True)
    payload = games._chess_state_payload(state)
    assert payload["fen"] == state["fen"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/unit/test_chess_eval_fen.py -v`
Expected: FAIL — `KeyError: 'fen'` (initial_state has no `fen`) and the payload assertion errors for the same reason.

- [ ] **Step 3: Implement `initial_state` fen**

In `src/backend/game_engine/chess_engine.py`, change `initial_state` to build the dict, set its FEN, then return it:

```python
    def initial_state(self, player_starts: bool) -> GameState:
        """Returns the opening chess position as a game state dict.

        Args:
            player_starts: If True, player controls white and moves first.
                If False, player controls black and the AI (white) moves first.

        Returns:
            Full game state dict with the standard starting position.
        """
        state: GameState = {
            "board": chess_game._create_initial_board(),
            "current_player": "white",
            "player_color": "white" if player_starts else "black",
            "game_active": True,
            "player_starts": player_starts,
            "king_positions": {"white": [7, 4], "black": [0, 4]},
            "castling_rights": {
                "white": {"kingside": True, "queenside": True},
                "black": {"kingside": True, "queenside": True},
            },
            "en_passant_target": None,
            "captured_pieces": {"player": [], "ai": []},
            "last_move": None,
            "in_check": False,
        }
        state["fen"] = self._to_fen(state)
        return state
```

(Keep the existing Google-style docstring; this is backend Python, where the repo convention is docstrings on public methods.)

- [ ] **Step 4: Implement payload fen**

In `src/backend/games.py`, add one line to the dict returned by `_chess_state_payload` (place it next to the other state fields, e.g. after `"castling_rights"`):

```python
        "castling_rights": state.get("castling_rights"),
        "fen": state.get("fen"),
        "status": "complete" if terminal else "in_progress",
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `python -m pytest tests/unit/test_chess_eval_fen.py tests/unit/test_chess_engine.py -v`
Expected: PASS (new tests pass; existing engine tests still pass).

- [ ] **Step 6: Commit**

```bash
git add src/backend/game_engine/chess_engine.py src/backend/games.py tests/unit/test_chess_eval_fen.py
git commit -m "Surface chess FEN in state and move payload"
```

---

## Task 2: UCI info parser (`lib/uci.ts`)

**Files:**
- Create: `src/frontend/src/lib/uci.ts`
- Test: `src/frontend/src/lib/uci.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/frontend/src/lib/uci.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseInfo } from './uci';

describe('parseInfo', () => {
    it('parses a cp score with depth', () => {
        const line = 'info depth 15 seldepth 20 score cp 42 nodes 1000 pv e2e4';
        expect(parseInfo(line)).toEqual({ depth: 15, scoreCp: 42, mate: null });
    });

    it('parses a mate score', () => {
        const line = 'info depth 12 score mate -3 pv e2e4';
        expect(parseInfo(line)).toEqual({ depth: 12, scoreCp: null, mate: -3 });
    });

    it('returns null for non-info and scoreless lines', () => {
        expect(parseInfo('bestmove e2e4')).toBeNull();
        expect(parseInfo('info string NNUE evaluation using nn-xyz.nnue')).toBeNull();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run uci`
Expected: FAIL — `parseInfo` is not exported from `./uci`.

- [ ] **Step 3: Write minimal implementation**

Create `src/frontend/src/lib/uci.ts`:

```ts
export interface UciInfo {
    depth: number;
    scoreCp: number | null;
    mate: number | null;
}

export const parseInfo = (line: string): UciInfo | null => {
    if (!line.startsWith('info ')) return null;
    const tokens = line.split(/\s+/);
    const depthIdx = tokens.indexOf('depth');
    const scoreIdx = tokens.indexOf('score');
    if (depthIdx === -1 || scoreIdx === -1) return null;
    const depth = Number(tokens[depthIdx + 1]);
    const kind = tokens[scoreIdx + 1];
    const value = Number(tokens[scoreIdx + 2]);
    if (Number.isNaN(depth) || Number.isNaN(value)) return null;
    if (kind === 'cp') return { depth, scoreCp: value, mate: null };
    if (kind === 'mate') return { depth, scoreCp: null, mate: value };
    return null;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run uci`
Expected: PASS (3 tests).

- [ ] **Step 5: Format, lint, commit**

```bash
npm run format
npm run lint
git add src/frontend/src/lib/uci.ts src/frontend/src/lib/uci.test.ts
git commit -m "Add UCI info line parser"
```

---

## Task 3: Score helpers (`lib/evalScore.ts`)

**Files:**
- Create: `src/frontend/src/lib/evalScore.ts`
- Test: `src/frontend/src/lib/evalScore.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/frontend/src/lib/evalScore.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { cpToWhiteFill, formatEval, normalizeToWhite, whiteFill } from './evalScore';

describe('evalScore', () => {
    it('cpToWhiteFill maps 0 to 0.5 and is monotonic', () => {
        expect(cpToWhiteFill(0)).toBeCloseTo(0.5, 5);
        expect(cpToWhiteFill(300)).toBeGreaterThan(cpToWhiteFill(0));
        expect(cpToWhiteFill(-300)).toBeLessThan(cpToWhiteFill(0));
    });

    it('cpToWhiteFill clamps extremes inside (0,1)', () => {
        expect(cpToWhiteFill(100000)).toBeLessThanOrEqual(1);
        expect(cpToWhiteFill(100000)).toBeGreaterThan(0.99);
        expect(cpToWhiteFill(-100000)).toBeLessThan(0.01);
    });

    it('whiteFill pins mate fully toward the mating side', () => {
        expect(whiteFill({ cp: null, mate: 3 })).toBe(1);
        expect(whiteFill({ cp: null, mate: -3 })).toBe(0);
        expect(whiteFill({ cp: 0, mate: null })).toBeCloseTo(0.5, 5);
    });

    it('normalizeToWhite negates a black-to-move score', () => {
        expect(normalizeToWhite({ depth: 10, scoreCp: 50, mate: null }, 'b')).toEqual({ cp: -50, mate: null });
        expect(normalizeToWhite({ depth: 10, scoreCp: 50, mate: null }, 'w')).toEqual({ cp: 50, mate: null });
        expect(normalizeToWhite({ depth: 10, scoreCp: null, mate: 2 }, 'b')).toEqual({ cp: null, mate: -2 });
    });

    it('formatEval renders pawns and mate', () => {
        expect(formatEval({ cp: 140, mate: null })).toBe('+1.4');
        expect(formatEval({ cp: -80, mate: null })).toBe('-0.8');
        expect(formatEval({ cp: null, mate: 3 })).toBe('M3');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run evalScore`
Expected: FAIL — module `./evalScore` has no exports.

- [ ] **Step 3: Write minimal implementation**

Create `src/frontend/src/lib/evalScore.ts`:

```ts
import type { UciInfo } from './uci';

export interface WhiteScore {
    cp: number | null;
    mate: number | null;
}

export const normalizeToWhite = (info: UciInfo, sideToMove: 'w' | 'b'): WhiteScore => {
    const sign = sideToMove === 'w' ? 1 : -1;
    return {
        cp: info.scoreCp === null ? null : info.scoreCp * sign,
        mate: info.mate === null ? null : info.mate * sign,
    };
};

export const cpToWhiteFill = (cp: number): number => {
    const clamped = Math.max(-1000, Math.min(1000, cp));
    return 1 / (1 + Math.exp(-0.00368208 * clamped));
};

export const whiteFill = (score: WhiteScore): number => {
    if (score.mate !== null) return score.mate > 0 ? 1 : 0;
    if (score.cp !== null) return cpToWhiteFill(score.cp);
    return 0.5;
};

export const formatEval = (score: WhiteScore): string => {
    if (score.mate !== null) return `M${Math.abs(score.mate)}`;
    if (score.cp !== null) {
        const pawns = score.cp / 100;
        return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(1)}`;
    }
    return '0.0';
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run evalScore`
Expected: PASS (5 tests).

- [ ] **Step 5: Format, lint, commit**

```bash
npm run format
npm run lint
git add src/frontend/src/lib/evalScore.ts src/frontend/src/lib/evalScore.test.ts
git commit -m "Add eval score helpers"
```

---

## Task 4: Vendor Stockfish and the engine factory

No unit test (browser Worker + WASM cannot run in jsdom). Verified by build and by the live check in Task 7.

**Files:**
- Create: `src/frontend/public/engine/` (vendored Stockfish files)
- Create: `src/frontend/src/lib/stockfishEngine.ts`
- Modify: `package.json` / `package-lock.json` (adds `stockfish` devDependency)

- [ ] **Step 1: Install the engine package**

```bash
npm install --save-dev stockfish@16
```

If `16` is not resolvable, install the latest 16.x: `npm install --save-dev stockfish@^16` and note the actual version.

- [ ] **Step 2: Identify the single-threaded NNUE build files**

```bash
ls node_modules/stockfish/src
```

Expected: a single-threaded NNUE set whose names contain `single`, e.g. `stockfish-nnue-16-single.js`, `stockfish-nnue-16-single.wasm` (there may be additional `.wasm` part files such as `stockfish-nnue-16-single-part-0.wasm`). Record the exact `.js` filename; it is the engine entry the worker loads.

- [ ] **Step 3: Copy the single-threaded set into the public engine dir**

PowerShell:

```powershell
New-Item -ItemType Directory -Force src/frontend/public/engine | Out-Null
Copy-Item node_modules/stockfish/src/*single* src/frontend/public/engine/
ls src/frontend/public/engine
```

Confirm the `.js` and its `.wasm` (plus any `single` part files) are present. Do **not** copy the multi-threaded (non-`single`) builds; they require SharedArrayBuffer.

- [ ] **Step 4: Write the engine factory**

Create `src/frontend/src/lib/stockfishEngine.ts`. Set `ENGINE_URL` to the exact `.js` filename copied in Step 3 (the example below assumes `stockfish-nnue-16-single.js`):

```ts
export interface UciEngine {
    post(command: string): void;
    onLine(handler: (line: string) => void): void;
    terminate(): void;
}

const ENGINE_URL = '/engine/stockfish-nnue-16-single.js';

export const createStockfishEngine = (): UciEngine => {
    const worker = new Worker(ENGINE_URL);
    return {
        post: command => worker.postMessage(command),
        onLine: handler => {
            worker.onmessage = event => {
                const line = typeof event.data === 'string' ? event.data : String(event.data?.data ?? '');
                if (line) handler(line);
            };
        },
        terminate: () => worker.terminate(),
    };
};
```

- [ ] **Step 5: Verify the build copies the engine assets**

```bash
npm run build
ls dist/engine
```

Expected: the engine `.js` and `.wasm` files are present under `dist/engine/` (Vite copies `public/` verbatim). Build succeeds with no errors.

- [ ] **Step 6: Format, lint, commit**

```bash
npm run format
npm run lint
git add package.json package-lock.json src/frontend/src/lib/stockfishEngine.ts src/frontend/public/engine
git commit -m "Vendor single-threaded Stockfish and add engine factory"
```

---

## Task 5: `useStockfishEval` hook

**Files:**
- Create: `src/frontend/src/hooks/useStockfishEval.ts`
- Test: `src/frontend/src/hooks/useStockfishEval.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/frontend/src/hooks/useStockfishEval.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useStockfishEval } from './useStockfishEval';
import type { UciEngine } from '../lib/stockfishEngine';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

const makeFakeEngine = () => {
    const posted: string[] = [];
    let lineHandler: (line: string) => void = () => {};
    const engine: UciEngine = {
        post: cmd => posted.push(cmd),
        onLine: h => {
            lineHandler = h;
        },
        terminate: () => posted.push('terminate'),
    };
    return { engine, posted, emit: (l: string) => lineHandler(l) };
};

describe('useStockfishEval', () => {
    it('issues position and go for a fen and exposes the parsed score', () => {
        const fake = makeFakeEngine();
        const factory = () => fake.engine;
        const { result } = renderHook(({ f }) => useStockfishEval(f, factory), {
            initialProps: { f: START as string | null },
        });
        expect(fake.posted).toContain(`position fen ${START}`);
        expect(fake.posted).toContain('go movetime 500');
        act(() => fake.emit('info depth 12 score cp 30 pv e2e4'));
        expect(result.current.cp).toBe(30);
        expect(result.current.depth).toBe(12);
    });

    it('cancels with stop and re-issues position on a new fen', () => {
        const fake = makeFakeEngine();
        const factory = () => fake.engine;
        const { rerender } = renderHook(({ f }) => useStockfishEval(f, factory), {
            initialProps: { f: START as string | null },
        });
        fake.posted.length = 0;
        rerender({ f: AFTER_E4 });
        expect(fake.posted[0]).toBe('stop');
        expect(fake.posted).toContain(`position fen ${AFTER_E4}`);
    });

    it('normalizes a black-to-move score to White', () => {
        const fake = makeFakeEngine();
        const factory = () => fake.engine;
        const { result } = renderHook(() => useStockfishEval(AFTER_E4, factory));
        act(() => fake.emit('info depth 10 score cp 25 pv e7e5'));
        expect(result.current.cp).toBe(-25);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run useStockfishEval`
Expected: FAIL — `useStockfishEval` is not exported.

- [ ] **Step 3: Write minimal implementation**

Create `src/frontend/src/hooks/useStockfishEval.ts`:

```ts
import { useEffect, useRef, useState } from 'react';
import { parseInfo } from '../lib/uci';
import { normalizeToWhite, type WhiteScore } from '../lib/evalScore';
import { createStockfishEngine, type UciEngine } from '../lib/stockfishEngine';

export interface EvalState extends WhiteScore {
    depth: number;
    ready: boolean;
}

const MOVETIME_MS = 500;

export const useStockfishEval = (
    fen: string | null,
    engineFactory: () => UciEngine = createStockfishEngine
): EvalState => {
    const [state, setState] = useState<EvalState>({ cp: null, mate: null, depth: 0, ready: false });
    const engineRef = useRef<UciEngine | null>(null);
    const sideRef = useRef<'w' | 'b'>('w');

    useEffect(() => {
        const engine = engineFactory();
        engineRef.current = engine;
        engine.onLine(line => {
            if (line.includes('uciok')) {
                setState(s => ({ ...s, ready: true }));
                return;
            }
            const info = parseInfo(line);
            if (!info) return;
            const white = normalizeToWhite(info, sideRef.current);
            setState(s => ({ ...s, cp: white.cp, mate: white.mate, depth: info.depth }));
        });
        engine.post('uci');
        return () => {
            engine.terminate();
            engineRef.current = null;
        };
    }, [engineFactory]);

    useEffect(() => {
        const engine = engineRef.current;
        if (!engine || !fen) return;
        sideRef.current = fen.split(' ')[1] === 'b' ? 'b' : 'w';
        setState(s => ({ ...s, cp: null, mate: null, depth: 0 }));
        engine.post('stop');
        engine.post(`position fen ${fen}`);
        engine.post(`go movetime ${MOVETIME_MS}`);
    }, [fen]);

    return state;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run useStockfishEval`
Expected: PASS (3 tests).

- [ ] **Step 5: Format, lint, commit**

```bash
npm run format
npm run lint
git add src/frontend/src/hooks/useStockfishEval.ts src/frontend/src/hooks/useStockfishEval.test.ts
git commit -m "Add useStockfishEval hook"
```

---

## Task 6: `EvalBar` component

**Files:**
- Create: `src/frontend/src/components/games/EvalBar.tsx`
- Test: `src/frontend/src/components/games/EvalBar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/frontend/src/components/games/EvalBar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import EvalBar from './EvalBar';

describe('EvalBar', () => {
    it('fills ~50% at an even score', () => {
        render(<EvalBar cp={0} mate={null} perspective='white' />);
        expect(screen.getByTestId('eval-bar-white').style.height).toBe('50%');
    });

    it('fills fully for White on mate and shows the mate label', () => {
        render(<EvalBar cp={null} mate={3} perspective='white' />);
        expect(screen.getByTestId('eval-bar-white').style.height).toBe('100%');
        expect(screen.getByText('M3')).toBeTruthy();
    });

    it('flips fill direction with perspective', () => {
        const { rerender } = render(<EvalBar cp={200} mate={null} perspective='white' />);
        expect(screen.getByTestId('eval-bar').style.flexDirection).toBe('column-reverse');
        rerender(<EvalBar cp={200} mate={null} perspective='black' />);
        expect(screen.getByTestId('eval-bar').style.flexDirection).toBe('column');
    });

    it('shows a positive pawn label', () => {
        render(<EvalBar cp={140} mate={null} perspective='white' />);
        expect(screen.getByText('+1.4')).toBeTruthy();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run EvalBar`
Expected: FAIL — `./EvalBar` has no default export.

- [ ] **Step 3: Write minimal implementation**

Create `src/frontend/src/components/games/EvalBar.tsx`:

```tsx
import { formatEval, whiteFill, type WhiteScore } from '../../lib/evalScore';

interface EvalBarProps {
    cp: number | null;
    mate: number | null;
    perspective: 'white' | 'black';
}

const EvalBar = ({ cp, mate, perspective }: EvalBarProps) => {
    const score: WhiteScore = { cp, mate };
    const whitePct = Math.round(whiteFill(score) * 100);
    const label = formatEval(score);
    return (
        <div
            data-testid='eval-bar'
            className='relative w-5 self-stretch overflow-hidden rounded bg-neutral'
            style={{ display: 'flex', flexDirection: perspective === 'white' ? 'column-reverse' : 'column' }}>
            <div
                data-testid='eval-bar-white'
                className='w-full bg-base-100 transition-[height] duration-300'
                style={{ height: `${whitePct}%` }}
            />
            <span className='pointer-events-none absolute inset-x-0 bottom-0.5 text-center text-[9px] font-semibold text-neutral-content'>
                {label}
            </span>
        </div>
    );
};

export default EvalBar;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run EvalBar`
Expected: PASS (4 tests).

- [ ] **Step 5: Format, lint, commit**

```bash
npm run format
npm run lint
git add src/frontend/src/components/games/EvalBar.tsx src/frontend/src/components/games/EvalBar.test.tsx
git commit -m "Add EvalBar component"
```

---

## Task 7: Wire the eval bar into ChessPage

Verified by typecheck/build, the full unit suite, and the spec's two Manual checks. ChessPage is the integration shell; no new unit test is added for the plumbing.

**Files:**
- Modify: `src/frontend/src/api/chess.ts` (`ChessGameState` interface, around line 3-29)
- Modify: `src/frontend/src/pages/games/ChessPage.tsx`

- [ ] **Step 1: Add `fen` to the API type**

In `src/frontend/src/api/chess.ts`, add `fen` to `ChessGameState` (the line position is illustrative; place it among the other fields):

```ts
export interface ChessGameState {
    board: (string | null)[][];
    current_player: 'white' | 'black';
    player_color: 'white' | 'black';
    game_active: boolean;
    player_starts: boolean;
    fen?: string;
    king_positions: { white: [number, number]; black: [number, number] };
```

`ChessMoveData extends Partial<ChessGameState>`, so it inherits the optional `fen`. No other type edits needed.

- [ ] **Step 2: Import the hook and EvalBar in ChessPage**

At the top of `src/frontend/src/pages/games/ChessPage.tsx`, add to the imports:

```ts
import EvalBar from '../../components/games/EvalBar';
import { useStockfishEval } from '../../hooks/useStockfishEval';
```

- [ ] **Step 3: Add `currentFen` state and the hook call**

After the existing `const [board, setBoard] = ...` group, add the state (near the other `useState` declarations):

```ts
    const [currentFen, setCurrentFen] = useState<string | null>(null);
```

After the `phase`/derived values are computed (anywhere inside the component body, before the `return`), add the hook call. Only analyze while playing:

```ts
    const evalScore = useStockfishEval(phase === 'playing' ? currentFen : null);
```

- [ ] **Step 4: Track the FEN from every confirmed position**

Make these edits so `currentFen` follows the authoritative FEN:

In `applyStateFromData` (used by `onMove`), add at the end of the callback body:

```ts
        if ('fen' in data && data.fen) setCurrentFen(data.fen);
```

In `subscribeSSE`, in the `onPlayerMove` handler, add:

```ts
                onPlayerMove: (data: ChessMoveData) => {
                    if (data.fen) setCurrentFen(data.fen);
                    if (data.notation) setMoveHistory(h => [...h, data.notation!]);
                },
```

In `handleStartGame`, after `setSessionId(id);` (where the new state is applied), add:

```ts
            setCurrentFen(state.fen ?? null);
```

In `handleStartGame`, in the reset block near the top (where `setBoard(emptyBoard())` etc. run), add:

```ts
        setCurrentFen(null);
```

In `handleResume`, after `setSessionId(sid);`, add:

```ts
        setCurrentFen(state.fen ?? null);
```

In `loadSession`, in the terminal branch (the `if (!state.game_active)` block, after `setSessionId(id);`), add:

```ts
                    setCurrentFen(state.fen ?? null);
```

In `handleNewGame`, add:

```ts
        setCurrentFen(null);
```

- [ ] **Step 5: Render the bar beside the board**

In the JSX, wrap the board's `<div className='relative'>` (the one directly containing `<ChessBoard ...>` and the overlays) with a flex row that places `EvalBar` to its left. Change:

```tsx
                    <div className='relative my-2 flex justify-center'>
                        <div className='relative'>
                            <ChessBoard
```

to:

```tsx
                    <div className='relative my-2 flex justify-center'>
                        <div className='flex items-stretch gap-2'>
                            {phase === 'playing' && (
                                <EvalBar cp={evalScore.cp} mate={evalScore.mate} perspective={playerColor} />
                            )}
                            <div className='relative'>
                                <ChessBoard
```

and add one extra closing `</div>` after the existing close of the `<div className='relative'>` board wrapper (so the new `flex items-stretch` div is closed). Confirm JSX balances by running the build in Step 6.

- [ ] **Step 6: Typecheck, build, run the full unit suite**

```bash
npx tsc --noEmit -p src/frontend
npm run build
npx vitest run
npm run lint
npm run format:check
```

Expected: typecheck clean, build succeeds, all unit tests pass, lint clean, formatting clean. If `format:check` fails, run `npm run format` and re-check.

- [ ] **Step 7: Manual live check (spec Manual cases)**

Start the app (`npm run dev`), sign in, start a chess game, and confirm:
- The eval bar appears to the left of the board, shows a near-even fill at the start, and updates after your move and after the AI's reply.
- Flip case: start a game as Black; the bar orientation flips (your side at the bottom) and values stay White-relative.
- Graceful absence: temporarily rename `src/frontend/public/engine` (or block the request) and reload; the chess page still loads and plays, with the bar simply not updating. Restore the folder afterwards.

- [ ] **Step 8: Commit**

```bash
git add src/frontend/src/api/chess.ts src/frontend/src/pages/games/ChessPage.tsx
git commit -m "Render Stockfish eval bar in ChessPage"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run the fast suite end to end**

```bash
npm run test:fast
```

Expected: Vitest unit + pytest unit + ESLint + Prettier all pass. (This is the CI-relevant gate.)

- [ ] **Step 2: Confirm the engine is single-threaded only**

Grep the public engine dir to confirm no multi-threaded build was copied:

```bash
ls src/frontend/public/engine
```

Expected: only `*single*` engine files. If any non-`single` `.js`/`.wasm` is present, delete it (it would require SharedArrayBuffer / COOP-COEP, which we intentionally avoid) and re-run Step 1.

- [ ] **Step 3: Push and open a PR**

Follow the website repo's `AGENTS.md` / `CONTRIBUTING.md` push and PR conventions. Do not enable auto-merge unless asked.

---

## Self-Review notes

- **Spec coverage:** FEN source (Task 1), `fen?` type (Task 7.1), engine vendoring + single-thread constraint (Task 4, Task 8.2), `uci.ts` (Task 2), `evalScore.ts` (Task 3), `useStockfishEval` cancel-on-fen + normalize (Task 5), `EvalBar` fill/orientation (Task 6), live wiring + graceful absence (Task 7) — all spec Test Cases map to a task.
- **Lazy-load note:** the engine loads only when `EvalBar`/the hook mount on the chess route; the engine `.js`/`.wasm` live in `public/` and are fetched at runtime by `new Worker(url)`, never bundled into the main JS chunk.
- **MIME:** if the production server serves `.wasm` with the wrong content type, the nmrugg engine falls back to non-streaming instantiation, so the bar still works; no action required unless the live check shows the engine never initializes, in which case add `mimetypes.add_type('application/wasm', '.wasm')` at backend startup.
