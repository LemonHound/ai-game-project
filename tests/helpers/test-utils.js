// Test utilities and helper functions

/**
 * Wait for game to be loaded and ready
 */
async function waitForGameLoad(page, gameId) {
    await page.goto(`/game/${gameId}`);
    await page.waitForLoadState('networkidle');

    // Wait for game board to be visible
    await page.locator('#game-board, .game-board').waitFor({ state: 'visible' });

    // Wait for JavaScript to initialize
    await page.waitForTimeout(1000);
}

/**
 * Login with demo credentials
 */
async function loginWithDemo(page) {
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

            // Wait for login to complete
            await page.waitForTimeout(2000);

            return true;
        }
    }

    return false;
}

/**
 * Check if user is logged in
 */
async function isLoggedIn(page) {
    const logoutButton = page.locator('button:has-text("Logout"), a:has-text("Logout")');
    return await logoutButton.count() > 0;
}

/**
 * Get game board squares for tic-tac-toe
 */
function getTicTacToeSquares(page) {
    return page.locator('#game-board button, #game-board .square, [data-index]');
}

/**
 * Make a move in tic-tac-toe and wait for AI response
 */
async function makeTicTacToeMove(page, squareIndex) {
    const squares = getTicTacToeSquares(page);
    await squares.nth(squareIndex).click();

    // Wait for move to register
    await page.waitForTimeout(500);

    // Wait for AI move
    await page.waitForTimeout(2500);
}

/**
 * Check if tic-tac-toe game is over
 */
async function isTicTacToeGameOver(page) {
    const gameStatus = page.locator('#game-status, .game-status').first();

    if (await gameStatus.isVisible()) {
        const statusText = await gameStatus.textContent();
        return statusText.toLowerCase().includes('win') ||
            statusText.toLowerCase().includes('lose') ||
            statusText.toLowerCase().includes('tie') ||
            statusText.toLowerCase().includes('draw');
    }

    return false;
}

/**
 * Get Connect4 columns
 */
function getConnect4Columns(page) {
    return page.locator('.column, [data-col], .col-btn, #game-board .column-btn');
}

/**
 * Make a move in Connect4
 */
async function makeConnect4Move(page, columnIndex) {
    const columns = getConnect4Columns(page);

    if (await columns.count() > columnIndex) {
        await columns.nth(columnIndex).click();
        await page.waitForTimeout(500);

        // Wait for AI move
        await page.waitForTimeout(2000);
    }
}

/**
 * Get Dots and Boxes lines
 */
function getDotsAndBoxesLines(page) {
    return page.locator('.line, [data-type="horizontal"], [data-type="vertical"]');
}

/**
 * Make a move in Dots and Boxes
 */
async function makeDotsAndBoxesMove(page, lineIndex) {
    const lines = getDotsAndBoxesLines(page);

    if (await lines.count() > lineIndex) {
        await lines.nth(lineIndex).click();
        await page.waitForTimeout(500);

        // Wait for AI move (if applicable)
        await page.waitForTimeout(1500);
    }
}

/**
 * Check for JavaScript errors
 */
function setupErrorTracking(page) {
    const errors = [];

    page.on('console', msg => {
        if (msg.type() === 'error') {
            errors.push(msg.text());
        }
    });

    page.on('pageerror', error => {
        errors.push(error.message);
    });

    return errors;
}

/**
 * Filter out non-critical errors
 */
function filterCriticalErrors(errors) {
    return errors.filter(error =>
        !error.includes('favicon') &&
        !error.includes('404') &&
        !error.includes('net::ERR_INTERNET_DISCONNECTED') &&
        !error.includes('chrome-extension') &&
        !error.includes('Non-Error promise rejection')
    );
}

/**
 * Wait for modal to appear
 */
async function waitForModal(page, modalSelector = '.modal, [role="dialog"]') {
    await page.locator(modalSelector).waitFor({ state: 'visible' });
    await page.waitForTimeout(300); // Wait for animation
}

/**
 * Close modal
 */
async function closeModal(page, modalId) {
    // Try close button first
    const closeButton = page.locator(`#${modalId} .btn-close, #${modalId} button:has-text("Close"), #${modalId} [data-dismiss="modal"]`);

    if (await closeButton.count() > 0) {
        await closeButton.first().click();
    } else {
        // Try clicking backdrop
        const modal = page.locator(`#${modalId}`);
        await modal.click({ position: { x: 0, y: 0 } });
    }

    await page.waitForTimeout(300);
}

/**
 * Check if element is in viewport
 */
async function isInViewport(page, selector) {
    return await page.locator(selector).isVisible();
}

/**
 * Scroll element into view
 */
async function scrollIntoView(page, selector) {
    await page.locator(selector).scrollIntoViewIfNeeded();
}

/**
 * Take screenshot with timestamp
 */
async function takeTimestampedScreenshot(page, name) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await page.screenshot({
        path: `test-results/screenshots/${name}-${timestamp}.png`,
        fullPage: true
    });
}

/**
 * Verify API response structure
 */
function verifyApiResponse(response, expectedProperties) {
    for (const prop of expectedProperties) {
        if (!response.hasOwnProperty(prop)) {
            throw new Error(`Expected property '${prop}' not found in API response`);
        }
    }
}

/**
 * Generate random test data
 */
function generateTestUser() {
    const timestamp = Date.now();
    return {
        email: `test.user.${timestamp}@example.com`,
        password: 'TestPassword123!',
        displayName: `Test User ${timestamp}`
    };
}

/**
 * Wait for network to be idle
 */
async function waitForNetworkIdle(page, timeout = 2000) {
    await page.waitForLoadState('networkidle', { timeout });
}

/**
 * Check responsive design at different viewports
 */
async function testResponsiveDesign(page, test) {
    const viewports = [
        { width: 375, height: 667, name: 'mobile' },
        { width: 768, height: 1024, name: 'tablet' },
        { width: 1024, height: 768, name: 'desktop-small' },
        { width: 1920, height: 1080, name: 'desktop-large' }
    ];

    for (const viewport of viewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.waitForTimeout(500); // Wait for layout to adjust

        // Run the test function with current viewport
        if (typeof test === 'function') {
            await test(page, viewport);
        }
    }
}

module.exports = {
    waitForGameLoad,
    loginWithDemo,
    isLoggedIn,
    getTicTacToeSquares,
    makeTicTacToeMove,
    isTicTacToeGameOver,
    getConnect4Columns,
    makeConnect4Move,
    getDotsAndBoxesLines,
    makeDotsAndBoxesMove,
    setupErrorTracking,
    filterCriticalErrors,
    waitForModal,
    closeModal,
    isInViewport,
    scrollIntoView,
    takeTimestampedScreenshot,
    verifyApiResponse,
    generateTestUser,
    waitForNetworkIdle,
    testResponsiveDesign
};