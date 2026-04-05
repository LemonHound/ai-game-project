import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import { type ReactElement } from 'react';
import { MemoryRouter, type MemoryRouterProps } from 'react-router-dom';

function createTestQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false, gcTime: 0 },
            mutations: { retry: false },
        },
    });
}

interface WrapperOptions {
    route?: string;
    routerProps?: Partial<MemoryRouterProps>;
}

export function renderWithProviders(ui: ReactElement, options?: RenderOptions & WrapperOptions) {
    const { route = '/', routerProps, ...renderOptions } = options || {};
    const queryClient = createTestQueryClient();

    function Wrapper({ children }: { children: React.ReactNode }) {
        return (
            <QueryClientProvider client={queryClient}>
                <MemoryRouter initialEntries={[route]} {...routerProps}>
                    {children}
                </MemoryRouter>
            </QueryClientProvider>
        );
    }

    return { ...render(ui, { wrapper: Wrapper, ...renderOptions }), queryClient };
}

export { createTestQueryClient };
