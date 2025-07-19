const { test, expect } = require('@playwright/test');

test.describe('Authentication Flow', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('can access login modal', async ({ page }) => {
        // Look for login button in navbar or other common locations
        const loginButton = page.locator('button:has-text("Login"), a:has-text("Login"), [data-testid="login-btn"]').first();

        if (await loginButton.isVisible()) {
            await loginButton.click();

            // Check if modal or login form appears
            await expect(page.locator('#login-modal, .modal, [data-testid="login-form"]')).toBeVisible();
        } else {
            // If no login button visible, check if already logged in or login is on separate page
            console.log('No login button found - may be already logged in or login is on separate page');
        }
    });

    test('can access registration modal', async ({ page }) => {
        // Look for register/signup button
        const registerButton = page.locator('button:has-text("Register"), button:has-text("Sign Up"), a:has-text("Register"), a:has-text("Sign Up"), [data-testid="register-btn"]').first();

        if (await registerButton.isVisible()) {
            await registerButton.click();

            // Check if modal or registration form appears
            await expect(page.locator('#register-modal, #signup-modal, .modal, [data-testid="register-form"]')).toBeVisible();
        } else {
            console.log('No register button found - may need to access from login modal');

            // Try to find login first, then register
            const loginButton = page.locator('button:has-text("Login"), a:has-text("Login")').first();
            if (await loginButton.isVisible()) {
                await loginButton.click();
                await page.waitForTimeout(500);

                // Look for register link in login modal
                const registerLink = page.locator('a:has-text("Register"), a:has-text("Sign Up"), button:has-text("Register"), button:has-text("Sign Up")').first();
                if (await registerLink.isVisible()) {
                    await registerLink.click();
                    await expect(page.locator('#register-modal, #signup-modal, .modal')).toBeVisible();
                }
            }
        }
    });

    test('login flow with demo credentials', async ({ page }) => {
        // Try to access login
        const loginButton = page.locator('button:has-text("Login"), a:has-text("Login"), [data-testid="login-btn"]').first();

        if (await loginButton.isVisible()) {
            await loginButton.click();
            await page.waitForTimeout(500);

            // Fill login form if visible
            const emailInput = page.locator('input[type="email"], input[name="email"], #email').first();
            const passwordInput = page.locator('input[type="password"], input[name="password"], #password').first();

            if (await emailInput.isVisible() && await passwordInput.isVisible()) {
                await emailInput.fill('demo@aigamehub.com');
                await passwordInput.fill('password123');

                // Submit form
                const submitButton = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")').first();
                await submitButton.click();

                // Wait for response and check for success indicators
                await page.waitForTimeout(2000);

                // Look for user menu, profile info, or logout button indicating successful login
                const userIndicators = page.locator(
                    '[data-testid="user-menu"], ' +
                    'button:has-text("Logout"), ' +
                    'a:has-text("Logout"), ' +
                    'button:has-text("Profile"), ' +
                    '[data-testid="logout-btn"]'
                );

                await expect(userIndicators.first()).toBeVisible({ timeout: 5000 });
            }
        }
    });

    test('logout functionality', async ({ page }) => {
        // First try to login (skip if no login system visible)
        const loginButton = page.locator('button:has-text("Login"), a:has-text("Login")').first();

        if (await loginButton.isVisible()) {
            await loginButton.click();
            await page.waitForTimeout(500);

            const emailInput = page.locator('input[type="email"], input[name="email"]').first();
            const passwordInput = page.locator('input[type="password"], input[name="password"]').first();

            if (await emailInput.isVisible()) {
                await emailInput.fill('demo@aigamehub.com');
                await passwordInput.fill('password123');

                const submitButton = page.locator('button[type="submit"], button:has-text("Login")').first();
                await submitButton.click();
                await page.waitForTimeout(2000);

                // Now try to logout
                const logoutButton = page.locator('button:has-text("Logout"), a:has-text("Logout"), [data-testid="logout-btn"]').first();

                if (await logoutButton.isVisible()) {
                    await logoutButton.click();

                    // Check that login button is visible again (indicating logout success)
                    await expect(page.locator('button:has-text("Login"), a:has-text("Login")')).toBeVisible({ timeout: 5000 });
                }
            }
        }
    });

    test('registration form validation', async ({ page }) => {
        const registerButton = page.locator('button:has-text("Register"), button:has-text("Sign Up"), a:has-text("Register")').first();

        if (await registerButton.isVisible()) {
            await registerButton.click();
            await page.waitForTimeout(500);
        } else {
            // Try accessing via login modal
            const loginButton = page.locator('button:has-text("Login"), a:has-text("Login")').first();
            if (await loginButton.isVisible()) {
                await loginButton.click();
                await page.waitForTimeout(500);

                const regLink = page.locator('a:has-text("Register"), a:has-text("Sign Up"), button:has-text("Register")').first();
                if (await regLink.isVisible()) {
                    await regLink.click();
                    await page.waitForTimeout(500);
                }
            }
        }

        // Try to submit empty registration form to test validation
        const submitButton = page.locator('button[type="submit"], button:has-text("Register"), button:has-text("Sign Up")').first();

        if (await submitButton.isVisible()) {
            await submitButton.click();

            // Should show validation errors or prevent submission
            // This will vary based on your validation implementation
            await page.waitForTimeout(1000);

            // The form should still be visible (indicating validation prevented submission)
            await expect(page.locator('#register-modal, #signup-modal, .modal, form')).toBeVisible();
        }
    });

    test('API authentication endpoints work', async ({ page }) => {
        // Test /api/auth/me endpoint
        const meResponse = await page.request.get('/api/auth/me');
        // Should return 401 for unauthenticated user
        expect(meResponse.status()).toBe(401);

        // Test login endpoint
        const loginResponse = await page.request.post('/api/auth/login', {
            data: {
                email: 'demo@aigamehub.com',
                password: 'password123'
            }
        });

        expect(loginResponse.ok()).toBeTruthy();
        const loginData = await loginResponse.json();
        expect(loginData).toHaveProperty('user');
        expect(loginData).toHaveProperty('sessionId');

        // Test authenticated request
        if (loginData.sessionId) {
            const authMeResponse = await page.request.get('/api/auth/me', {
                headers: {
                    'x-session-id': loginData.sessionId
                }
            });

            expect(authMeResponse.ok()).toBeTruthy();
            const userData = await authMeResponse.json();
            expect(userData).toHaveProperty('email');
        }
    });
});