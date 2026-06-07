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
