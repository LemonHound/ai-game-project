import { describe, expect, it } from 'vitest';
import { fetchCurrentUser, login, logout } from './auth';

describe('auth api', () => {
    it('auth api login sends correct request', async () => {
        const result = await login('test@example.com', 'password123');
        expect(result.user).toBeDefined();
        expect(result.user.email).toBe('test@example.com');
    });

    it('fetchCurrentUser returns user', async () => {
        const user = await fetchCurrentUser();
        expect(user.username).toBe('testuser');
        expect(user.email).toBe('test@example.com');
    });

    it('logout succeeds', async () => {
        await expect(logout()).resolves.not.toThrow();
    });
});
