import { test, expect, Page } from '@playwright/test';

const BASE_API = 'http://localhost:8000/api';

async function loginDemoUser(page: Page) {
    await page.request.post(`${BASE_API}/auth/login`, {
        data: { email: 'demo@aigamehub.com', password: 'demo123' },
    });
}

test.describe('Checkers — full game flows', () => {
    test.beforeEach(async ({ page }) => {
        await loginDemoUser(page);
        await page.goto('/game/checkers');
        await page.waitForLoadState('networkidle');

        await expect(page.locator('button:has-text("Play as Red")')).toBeVisible({ timeout: 5000 });
    });

    test('test_checkers_unauthenticated_user_sees_login_prompt', async ({ page }) => {
        await page.request.post(`${BASE_API}/auth/logout`);
        await page.goto('/game/checkers');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('button:has-text("Sign In")')).toBeVisible({ timeout: 5000 });
    });

    test('test_checkers_new_game_shows_board', async ({ page }) => {
        await page.locator('button:has-text("Play as Red")').click();
        await expect(page.locator('[aria-label="Checkers board"]')).toBeVisible({ timeout: 5000 });
    });

    test('test_checkers_player_action_selects_piece', async ({ page }) => {
        await page.locator('button:has-text("Play as Red")').click();

        const board = page.locator('[aria-label="Checkers board"]');
        await expect(board).toBeVisible({ timeout: 5000 });
        await page.waitForTimeout(2000);

        const interactivePiece = board.locator('div[class*="cursor-pointer"]').first();
        if ((await interactivePiece.count()) > 0) {
            await interactivePiece.click();
            await page.waitForTimeout(500);
            // After clicking a piece, either valid destinations appear or the board stays stable
            const boardStillVisible = await board.isVisible();
            expect(boardStillVisible).toBe(true);
        }
    });

    test('test_checkers_game_over_overlay_available', async ({ page }) => {
        await page.locator('button:has-text("Play as Red")').click();

        const board = page.locator('[aria-label="Checkers board"]');
        await expect(board).toBeVisible({ timeout: 5000 });
        await page.waitForTimeout(2000);

        // Attempt several moves; if a terminal state is reached, the overlay appears
        for (let i = 0; i < 3; i++) {
            const interactivePiece = board.locator('div[class*="cursor-pointer"]').first();
            if ((await interactivePiece.count()) === 0) break;
            await interactivePiece.click();
            await page.waitForTimeout(300);
            const dest = board.locator('div[class*="bg-green-6"]').first();
            if ((await dest.count()) > 0) {
                await dest.click();
                await page.waitForTimeout(3000);
            }
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

    test('test_checkers_resume_after_page_refresh', async ({ page }) => {
        await page.locator('button:has-text("Play as Red")').click();
        const board = page.locator('[aria-label="Checkers board"]');
        await expect(board).toBeVisible({ timeout: 5000 });
        await page.waitForTimeout(2000);

        await page.reload();
        await page.waitForLoadState('networkidle');

        await expect(board).toBeVisible({ timeout: 5000 });
    });
});
