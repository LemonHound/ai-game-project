import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCountUp } from './useCountUp';

describe('useCountUp', () => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('starts at 0', () => {
        const { result } = renderHook(() => useCountUp(100, 500));
        expect(result.current).toBe(0);
    });

    it('useCountUp animates from 0 to target', async () => {
        const { result } = renderHook(() => useCountUp(100, 100));
        await act(async () => {
            vi.advanceTimersByTime(200);
        });
        expect(result.current).toBe(100);
    });

    it('handles zero target', () => {
        const { result } = renderHook(() => useCountUp(0, 100));
        expect(result.current).toBe(0);
    });
});
