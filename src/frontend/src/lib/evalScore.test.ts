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
