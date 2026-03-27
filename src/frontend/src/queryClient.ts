import { QueryClient } from '@tanstack/react-query';
import { GameApiError } from './api/games';
import { useNotificationStore } from './store/notifications';

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 1,
            staleTime: 1000 * 60 * 5,
            refetchOnWindowFocus: false,
        },
        mutations: {
            retry: (failureCount, error) => {
                if (error instanceof GameApiError && error.status >= 400 && error.status < 500) {
                    return false;
                }
                return failureCount < 2;
            },
            onError: (error) => {
                if (error instanceof GameApiError && error.status === 401) {
                    useNotificationStore.getState().push({
                        level: 'warning',
                        title: 'Session expired',
                        description: 'Please log in again to continue.',
                    });
                }
            },
        },
    },
});
