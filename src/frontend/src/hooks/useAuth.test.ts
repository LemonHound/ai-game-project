import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { useAuth } from './useAuth';

function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    return ({ children }: { children: React.ReactNode }) =>
        createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useAuth', () => {
    it('useAuth returns user after login', async () => {
        const { result } = renderHook(() => useAuth(), {
            wrapper: createWrapper(),
        });
        await waitFor(() => {
            expect(result.current.isLoading).toBe(false);
        });
        expect(result.current.user).not.toBeNull();
        expect(result.current.user?.username).toBe('testuser');
    });
});
