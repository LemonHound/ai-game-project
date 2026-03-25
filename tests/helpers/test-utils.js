const { expect } = require('@playwright/test');

async function loginWithDemo(page) {
    const csrfResponse = await page.request.get('/api/auth/csrf-token');
    const csrfData = await csrfResponse.json();

    await page.request.post('/api/auth/login', {
        data: { email: 'demo@aigamehub.com', password: 'demo123' },
        headers: { 'X-CSRF-Token': csrfData.csrfToken },
    });

    await page.reload();
    await page.waitForLoadState('networkidle');
}

async function logoutUser(page) {
    const csrfResponse = await page.request.get('/api/auth/csrf-token');
    const csrfData = await csrfResponse.json();
    await page.request.post('/api/auth/logout', {
        headers: { 'X-CSRF-Token': csrfData.csrfToken },
    });
    await page.reload();
}

async function waitForGameLoad(page) {
    await page.waitForLoadState('networkidle');
    await expect(page.locator('main')).toBeVisible();
}

function generateTestUser() {
    const timestamp = Date.now();
    return {
        username: `testuser${timestamp}`,
        email: `test${timestamp}@example.com`,
        password: 'password123',
        displayName: `Test User ${timestamp}`,
    };
}

function verifyApiResponse(data, requiredFields) {
    expect(data).toBeDefined();
    for (const field of requiredFields) {
        expect(data).toHaveProperty(field);
    }
}

module.exports = {
    loginWithDemo,
    logoutUser,
    waitForGameLoad,
    generateTestUser,
    verifyApiResponse,
};
