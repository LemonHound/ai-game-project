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

/**
 * Fetch the currently authenticated user's profile from the session cookie.
 *
 * @returns The authenticated User object.
 * @throws {Error} If the session is missing or expired (401).
 */
export async function fetchCurrentUser(): Promise<User> {
    return request<User>('/api/auth/me');
}

/**
 * Authenticate a user with email and password.
 *
 * @param email - User's email address.
 * @param password - User's plaintext password.
 * @param rememberMe - If true, requests a 30-day session instead of the default 7-day session.
 * @returns Object containing the authenticated User profile.
 * @throws {Error} If the credentials are invalid or the account uses a different auth provider.
 */
export async function login(email: string, password: string, rememberMe = false): Promise<{ user: User }> {
    return request<{ user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, rememberMe }),
    });
}

/**
 * Register a new local user account and start a session.
 *
 * @param username - Desired username (minimum 3 characters).
 * @param email - Unique email address.
 * @param password - Password (minimum 6 characters).
 * @param displayName - Optional display name; defaults to username on the server.
 * @returns Object containing the newly created User profile.
 * @throws {Error} If the username or email is already taken, or validation fails.
 */
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

/**
 * Log out the current user and clear the session cookie server-side.
 */
export async function logout(): Promise<void> {
    await request('/api/auth/logout', { method: 'POST' });
}
