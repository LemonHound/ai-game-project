import type { User } from '../types';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(path, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...options?.headers },
        ...options,
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Request failed' }));
        throw new Error(error.detail ?? 'Request failed');
    }
    return response.json() as Promise<T>;
}

export async function fetchCurrentUser(): Promise<User> {
    return request<User>('/api/auth/me');
}

export async function login(email: string, password: string, rememberMe = false): Promise<{ user: User }> {
    return request<{ user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, rememberMe }),
    });
}

export async function register(
    username: string,
    email: string,
    password: string,
    displayName?: string
): Promise<{ user: User }> {
    return request<{ user: User }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, password, displayName }),
    });
}

export async function logout(): Promise<void> {
    await request('/api/auth/logout', { method: 'POST' });
}
