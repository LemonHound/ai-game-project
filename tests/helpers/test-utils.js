const { expect } = require('@playwright/test');

async function loginWithDemo(page) {
    // Check if we're on mobile by getting viewport size
    const viewport = page.viewportSize();
    const isMobile = viewport && viewport.width < 768;

    if (isMobile) {
        // On mobile, scroll to top and ensure navbar is visible
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(500); // Wait for scroll to complete
    }

    // Try to find and click the login button with better mobile handling
    const loginButton = page.locator('[data-testid="navbar-login-btn"]');

    // Ensure the button is visible and in viewport
    await loginButton.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    // Click with force to bypass any mobile viewport issues
    await loginButton.click({ force: true });

    // Wait for modal to open
    await expect(page.locator('#login-modal.modal-open')).toBeVisible();

    // Fill in credentials
    await page.fill('#login-email', 'demo@aigamehub.com');
    await page.fill('#login-password', 'password123');

    // Click submit
    await page.click('[data-testid="login-submit-btn"]');

    // Wait for successful login
    await expect(page.locator('#auth-logged-in')).toBeVisible();
}

async function logoutUser(page) {
    await page.click('.dropdown .avatar');
    await page.click('text=Logout');
    await expect(page.locator('#auth-not-logged-in')).toBeVisible();
}

async function waitForGameLoad(page, gameId) {
    await page.waitForLoadState('networkidle');

    switch (gameId) {
        case 'tic-tac-toe':
            await expect(page.locator('#tic-tac-toe-board')).toBeVisible();
            break;
        case 'connect4':
            await expect(page.locator('#connect4-board')).toBeVisible();
            break;
        case 'dots-and-boxes':
            await expect(page.locator('#dots-and-boxes-board')).toBeVisible();
            break;
        default:
            await expect(page.locator('[class*="game"]')).toBeVisible();
    }
}

async function makeTicTacToeMove(page, position) {
    await page.click(`.game-square[data-position="${position}"]`);
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
    makeTicTacToeMove,
    generateTestUser,
    verifyApiResponse,
};
