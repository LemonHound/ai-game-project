const { test, expect } = require('@playwright/test');
const bcrypt = require('bcrypt');

test.describe('Authentication Flow', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('can access login modal', async ({ page }) => {
        await page.click('[data-testid="navbar-login-btn"]', { force: true });
        await expect(page.locator('#login-modal.modal-open')).toBeVisible();
    });

    test('can access registration modal', async ({ page }) => {
        await page.click('[data-testid="navbar-signup-btn"]', { force: true });
        await expect(page.locator('#register-modal.modal-open')).toBeVisible();
    });

    test('login flow with demo credentials', async ({ page }) => {
        await page.click('[data-testid="navbar-login-btn"]', { force: true });
        await expect(page.locator('#login-modal.modal-open')).toBeVisible();

        await page.fill('#login-email', 'demo@aigamehub.com');
        await page.fill('#login-password', 'password123');
        await page.click('[data-testid="login-submit-btn"]');

        await expect(page.locator('#auth-logged-in')).toBeVisible();
    });

    test('logout functionality', async ({ page }) => {
        // Login first
        await page.click('[data-testid="navbar-login-btn"]', { force: true });
        await expect(page.locator('#login-modal.modal-open')).toBeVisible();

        await page.fill('#login-email', 'demo@aigamehub.com');
        await page.fill('#login-password', 'password123');
        await page.click('[data-testid="login-submit-btn"]');

        await expect(page.locator('#auth-logged-in')).toBeVisible();

        // Now logout
        await page.click('.dropdown .avatar');
        await page.click('text=Logout');

        await expect(page.locator('#auth-not-logged-in')).toBeVisible();
    });

    test('registration form validation', async ({ page }) => {
        await page.click('[data-testid="navbar-signup-btn"]', { force: true });
        await expect(page.locator('#register-modal.modal-open')).toBeVisible();

        // Test password mismatch
        await page.fill('#register-username', 'testuser');
        await page.fill('#register-email', 'test@example.com');
        await page.fill('#register-password', 'password123');
        await page.fill('#register-confirm-password', 'differentpassword');

        await page.click('[data-testid="register-submit-btn"]', {
            force: true,
        });

        await expect(page.locator('#register-error')).toBeVisible();
        await expect(page.locator('#register-error')).toContainText('Passwords do not match');
    });

    test('can navigate between login and register modals', async ({ page }) => {
        await page.click('[data-testid="navbar-login-btn"]', { force: true });
        await expect(page.locator('#login-modal.modal-open')).toBeVisible();

        await page.click('text=Create Account', { force: true });
        await expect(page.locator('#register-modal.modal-open')).toBeVisible();

        await page.click('text=Already have an account?', { force: true });
        await expect(page.locator('#login-modal.modal-open')).toBeVisible();
    });

    test('API authentication endpoints work', async ({ page }) => {
        const meResponse = await page.request.get('/api/auth/me');
        expect(meResponse.status()).toBe(401);

        // Get CSRF token first
        const csrfResponse = await page.request.get('/api/csrf-token');
        expect(csrfResponse.ok()).toBeTruthy();
        const csrfData = await csrfResponse.json();

        const loginResponse = await page.request.post('/api/auth/login', {
            data: {
                email: 'demo@aigamehub.com',
                password: 'password123',
            },
            headers: {
                'X-CSRF-Token': csrfData.csrfToken,
            },
        });

        expect(loginResponse.ok()).toBeTruthy();
        const loginData = await loginResponse.json();
        expect(loginData).toHaveProperty('user');
        expect(loginData).toHaveProperty('message'); // Your API returns message, not sessionId

        // Since your API uses cookies, the session should be automatically available
        const authMeResponse = await page.request.get('/api/auth/me');
        expect(authMeResponse.ok()).toBeTruthy();
        const userData = await authMeResponse.json();
        expect(userData.email).toBe('demo@aigamehub.com');
    });
});
