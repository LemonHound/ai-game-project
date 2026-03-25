import { useMutation, useQuery } from '@tanstack/react-query';
import { fetchCurrentUser, login, logout, register } from '../api/auth';
import { queryClient } from '../queryClient';
import type { User } from '../types';

const USER_QUERY_KEY = ['user'] as const;

export function useAuth() {
    const { data: user, isPending } = useQuery<User | null>({
        queryKey: USER_QUERY_KEY,
        queryFn: () => fetchCurrentUser().catch(() => null),
        staleTime: Infinity,
    });

    return { user: user ?? null, isLoading: isPending };
}

export function useLogin() {
    return useMutation({
        mutationFn: ({ email, password, rememberMe }: { email: string; password: string; rememberMe?: boolean }) =>
            login(email, password, rememberMe),
        onSuccess: ({ user }) => {
            queryClient.setQueryData(USER_QUERY_KEY, user);
        },
    });
}

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

export function useLogout() {
    return useMutation({
        mutationFn: logout,
        onSuccess: () => {
            queryClient.setQueryData(USER_QUERY_KEY, null);
        },
    });
}
