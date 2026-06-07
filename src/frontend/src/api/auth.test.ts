import { describe, expect, it } from 'vitest';
import { fetchCurrentUser, login, logout, register } from './auth';

describe('auth api', () => {
    it('auth api login sends correct request', async () => {
        const result = await login('test@example.com', 'password123');
        expect(result.user).toBeDefined();
        expect(result.user.email).toBe('test@example.com');
    });

    it('fetchCurrentUser returns user whose username is their email', async () => {
        const user = await fetchCurrentUser();
        expect(user.email).toBe('test@example.com');
        expect(user.username).toBe('test@example.com');
    });

    it('register sends email, password and displayName and returns username equal to email', async () => {
        const result = await register('newperson@example.com', 'password123', 'New Person');
        expect(result.user.email).toBe('newperson@example.com');
        expect(result.user.username).toBe('newperson@example.com');
        expect(result.user.displayName).toBe('New Person');
    });

    it('logout succeeds', async () => {
        await expect(logout()).resolves.not.toThrow();
    });
});
