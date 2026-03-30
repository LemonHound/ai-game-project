import { useMutation, useQuery } from '@tanstack/react-query';
import { fetchCurrentUser, login, logout, register } from '../api/auth';
import { queryClient } from '../queryClient';
import type { User } from '../types';

const USER_QUERY_KEY = ['user'] as const;

/**
 * Return the current authenticated user and loading state.
 * Fetches from the server on mount; returns null user while loading or when unauthenticated.
 *
 * @returns Object with `user` (User | null) and `isLoading` (boolean).
 */
export function useAuth() {
    const { data: user, isPending } = useQuery<User | null>({
        queryKey: USER_QUERY_KEY,
        queryFn: () => fetchCurrentUser().catch(() => null),
        staleTime: Infinity,
    });

    return { user: user ?? null, isLoading: isPending };
}

/**
 * Return a TanStack Query mutation for email/password login.
 * On success, updates the cached user in the query client.
 *
 * @returns Mutation object with mutateAsync({ email, password, rememberMe? }).
 */
export function useLogin() {
    return useMutation({
        mutationFn: ({ email, password, rememberMe }: { email: string; password: string; rememberMe?: boolean }) =>
            login(email, password, rememberMe),
        onSuccess: ({ user }) => {
            queryClient.setQueryData(USER_QUERY_KEY, user);
        },
    });
}

/**
 * Return a TanStack Query mutation for new user registration.
 * On success, updates the cached user in the query client.
 *
 * @returns Mutation object with mutateAsync({ username, email, password, displayName? }).
 */
export function useRegister() {
    return useMutation({
        mutationFn: ({
            username,
            email,
            password,
            displayName,
        }: {
            username: string;
            email: string;
            password: string;
            displayName?: string;
        }) => register(username, email, password, displayName),
        onSuccess: ({ user }) => {
            queryClient.setQueryData(USER_QUERY_KEY, user);
        },
    });
}

/**
 * Return a TanStack Query mutation for logout.
 * On success, sets the cached user to null.
 *
 * @returns Mutation object with mutateAsync().
 */
export function useLogout() {
    return useMutation({
        mutationFn: logout,
        onSuccess: () => {
            queryClient.setQueryData(USER_QUERY_KEY, null);
        },
    });
}
