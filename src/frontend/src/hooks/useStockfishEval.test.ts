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
