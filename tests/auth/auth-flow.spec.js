const { test, expect } = require('@playwright/test');
const { loginWithDemo, generateTestUser } = require('../helpers/test-utils');

test.describe('Authentication API', () => {
    test('unauthenticated /api/auth/me returns 401', async ({ page }) => {
        const response = await page.request.get('/api/auth/me');
        expect(response.status()).toBe(401);
    });

    test('login with valid demo credentials', async ({ page }) => {
        const csrfResponse = await page.request.get('/api/auth/csrf-token');
        expect(csrfResponse.ok()).toBeTruthy();
        const { csrfToken } = await csrfResponse.json();

        const loginResponse = await page.request.post('/api/auth/login', {
            data: { email: 'demo@aigamehub.com', password: 'demo123' },
            headers: { 'X-CSRF-Token': csrfToken },
        });
        expect(loginResponse.ok()).toBeTruthy();
        const loginData = await loginResponse.json();
        expect(loginData).toHaveProperty('user');
    });

    test('login with wrong password returns 401', async ({ page }) => {
        const csrfResponse = await page.request.get('/api/auth/csrf-token');
        const { csrfToken } = await csrfResponse.json();

        const response = await page.request.post('/api/auth/login', {
            data: { email: 'demo@aigamehub.com', password: 'wrongpassword' },
            headers: { 'X-CSRF-Token': csrfToken },
        });
        expect(response.status()).toBe(401);
    });

    test('session persists: /api/auth/me returns user after login', async ({ page }) => {
        await page.goto('/');
        await loginWithDemo(page);

        const meResponse = await page.request.get('/api/auth/me');
        expect(meResponse.ok()).toBeTruthy();
        const userData = await meResponse.json();
        expect(userData.email).toBe('demo@aigamehub.com');
    });

    test('logout clears session', async ({ page }) => {
        await page.goto('/');
        await loginWithDemo(page);

        const csrfResponse = await page.request.get('/api/auth/csrf-token');
        const { csrfToken } = await csrfResponse.json();
        await page.request.post('/api/auth/logout', {
            headers: { 'X-CSRF-Token': csrfToken },
        });

        const meResponse = await page.request.get('/api/auth/me');
        expect(meResponse.status()).toBe(401);
    });

    test('register with duplicate email returns 409', async ({ page }) => {
        const csrfResponse = await page.request.get('/api/auth/csrf-token');
        const { csrfToken } = await csrfResponse.json();

        const response = await page.request.post('/api/auth/register', {
            data: {
                username: 'dupetest',
                email: 'demo@aigamehub.com',
                password: 'password123',
                displayName: 'Dupe Test',
            },
            headers: { 'X-CSRF-Token': csrfToken },
        });
        expect(response.status()).toBe(409);
    });
});
