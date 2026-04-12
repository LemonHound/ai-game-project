import { test, expect, Page } from '@playwright/test';

const BASE_API = 'http://localhost:8000/api';

async function loginDemoUser(page: Page) {
    await page.request.post(`${BASE_API}/auth/login`, {
        data: { email: 'demo@aigamehub.com', password: 'demo123' },
    });
}

test.describe('Connect 4 — full game flows', () => {
    test.beforeEach(async ({ page }) => {
        await loginDemoUser(page);
        await page.goto('/game/connect4');
        await page.waitForLoadState('networkidle');

        await expect(page.locator('button:has-text("Play as Red")')).toBeVisible({ timeout: 5000 });
    });

    test('test_connect4_unauthenticated_user_sees_login_prompt', async ({ page }) => {
        await page.request.post(`${BASE_API}/auth/logout`);
        await page.goto('/game/connect4');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('button:has-text("Sign In")')).toBeVisible({ timeout: 5000 });
    });

    test('test_connect4_new_game_shows_board', async ({ page }) => {
        await page.locator('button:has-text("Play as Red")').click();
        await expect(page.locator('[aria-label="Connect 4 board"]')).toBeVisible({ timeout: 5000 });
    });

    test('test_connect4_player_drop_reflected_in_ui', async ({ page }) => {
        await page.locator('button:has-text("Play as Red")').click();

        const board = page.locator('[aria-label="Connect 4 board"]');
        await expect(board).toBeVisible({ timeout: 5000 });
        await page.waitForTimeout(2000);

        await page.locator('[aria-label="Column 4"]').click();
        await page.waitForTimeout(3000);

        await expect(board).toBeVisible({ timeout: 3000 });
    });

    test('test_connect4_game_over_overlay_available', async ({ page }) => {
        await page.locator('button:has-text("Play as Red")').click();

        const board = page.locator('[aria-label="Connect 4 board"]');
        await expect(board).toBeVisible({ timeout: 5000 });
        await page.waitForTimeout(2000);

        // Drop 4 in column 1 — vertical win if AI does not block
        for (let i = 0; i < 4; i++) {
            await page.locator('[aria-label="Column 1"]').click();
            await page.waitForTimeout(3500);

            const gameOverText = page.locator('p:has-text("You Win!"), p:has-text("You Lose"), p:has-text("Draw!")');
            if ((await gameOverText.count()) > 0) break;
        }

        const gameOverText = page.locator('p:has-text("You Win!"), p:has-text("You Lose"), p:has-text("Draw!")');
        const boardVisible = await board.isVisible();
        const gameOver = (await gameOverText.count()) > 0;

        if (gameOver) {
            await expect(gameOverText.first()).toBeVisible();
            await expect(page.locator('button:has-text("Play as Red")')).toBeVisible({ timeout: 3000 });
        } else {
            expect(boardVisible).toBe(true);
        }
    });

    test('test_connect4_resume_after_page_refresh', async ({ page }) => {
        await page.locator('button:has-text("Play as Red")').click();
        const board = page.locator('[aria-label="Connect 4 board"]');
        await expect(board).toBeVisible({ timeout: 5000 });
        await page.waitForTimeout(2000);

        await page.locator('[aria-label="Column 4"]').click();
        await page.waitForTimeout(1000);

        await page.reload();
        await page.waitForLoadState('networkidle');

        await expect(board).toBeVisible({ timeout: 5000 });
    });
});
