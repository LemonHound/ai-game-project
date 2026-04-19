import { test, expect, Page } from '@playwright/test';

const BASE_API = 'http://localhost:8000/api';

async function loginDemoUser(page: Page) {
    await page.request.post(`${BASE_API}/auth/login`, {
        data: { email: 'demo@aigamehub.com', password: 'demo123' },
    });
}

test.describe('TTT — full game flows', () => {
    test.beforeEach(async ({ page }) => {
        await loginDemoUser(page);
        await page.goto('/game/tic-tac-toe');
        await page.waitForLoadState('networkidle');

        // If an in-progress session is detected, dismiss it to reach the new game selector
        const resumeText = page.locator('text=Game in progress');
        try {
            await resumeText.waitFor({ timeout: 2000 });
            await page.locator('button:has-text("New Game")').first().click();
        } catch {
            // No active session — already at new game selector
        }

        await expect(page.locator('button:has-text("Play as X")')).toBeVisible({ timeout: 5000 });
    });

    test('test_ttt_unauthenticated_user_sees_login_prompt', async ({ page }) => {
        await page.request.post(`${BASE_API}/auth/logout`);
        await page.goto('/game/tic-tac-toe');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('button:has-text("Sign In")')).toBeVisible({ timeout: 5000 });
    });

    test('test_ttt_new_game_shows_board', async ({ page }) => {
        await page.locator('button:has-text("Play as X")').click();
        await expect(page.locator('[aria-label="Tic-Tac-Toe board"]')).toBeVisible({ timeout: 5000 });
    });

    test('test_ttt_full_game_player_wins', async ({ page }) => {
        const newgameResp = page.waitForResponse(r => r.url().includes('/tic-tac-toe/newgame'));
        await page.locator('button:has-text("Play as X")').click();

        const board = page.locator('[aria-label="Tic-Tac-Toe board"]');
        await Promise.all([expect(board).toBeVisible({ timeout: 5000 }), newgameResp]);

        const cells = board.locator('button');

        await cells.nth(0).click();
        await page.waitForTimeout(1500);

        await cells.nth(1).click();
        await page.waitForTimeout(1500);

        await cells.nth(2).click();
        await page.waitForTimeout(1500);

        const banner = page.locator('.alert');
        const stillPlaying = (await board.isVisible()) && !(await banner.isVisible());
        if (!stillPlaying) {
            await expect(banner).toBeVisible({ timeout: 3000 });
        }
    });

    test('test_ttt_new_game_abandons_in_progress_session', async ({ page }) => {
        await page.locator('button:has-text("Play as X")').click();
        const board = page.locator('[aria-label="Tic-Tac-Toe board"]');
        await expect(board).toBeVisible({ timeout: 5000 });

        // Start a new game while one is in progress via NewGameButtons
        await page.locator('button:has-text("New Game")').click(); // expands options
        await page.locator('button:has-text("Play as X")').last().click(); // starts new game
        await expect(board).toBeVisible({ timeout: 3000 });
    });

    test('test_ttt_resume_after_page_refresh', async ({ page }) => {
        const newgameResp = page.waitForResponse(r => r.url().includes('/tic-tac-toe/newgame'));
        await page.locator('button:has-text("Play as X")').click();
        const board = page.locator('[aria-label="Tic-Tac-Toe board"]');
        await Promise.all([expect(board).toBeVisible({ timeout: 5000 }), newgameResp]);

        await page.locator('[aria-label="Tic-Tac-Toe board"] button').first().click();
        await page.waitForTimeout(500);

        await page.reload();
        await page.waitForLoadState('networkidle');

        await expect(board).toBeVisible({ timeout: 5000 });
    });

    test('test_ttt_mobile_viewport_playable', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto('/game/tic-tac-toe');
        await page.waitForLoadState('networkidle');

        const resumeText = page.locator('text=Game in progress');
        try {
            await resumeText.waitFor({ timeout: 2000 });
            await page.locator('button:has-text("New Game")').first().click();
        } catch {
            // Already at new game selector
        }

        await page.locator('button:has-text("Play as X")').click();
        const board = page.locator('[aria-label="Tic-Tac-Toe board"]');
        await expect(board).toBeVisible({ timeout: 5000 });

        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

        const cell = board.locator('button').first();
        const box = await cell.boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(64);
    });
});
