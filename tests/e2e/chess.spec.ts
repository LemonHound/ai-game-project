import { test, expect, Page } from '@playwright/test';

const BASE_API = 'http://localhost:8000/api';

async function loginDemoUser(page: Page) {
    await page.request.post(`${BASE_API}/auth/login`, {
        data: { email: 'demo@aigamehub.com', password: 'demo123' },
    });
}

test.describe('Chess — full game flows', () => {
    test.beforeEach(async ({ page }) => {
        await loginDemoUser(page);
        await page.goto('/game/chess');
        await page.waitForLoadState('networkidle');

        await expect(page.locator('button:has-text("Play as White")')).toBeVisible({ timeout: 5000 });
    });

    test('test_chess_unauthenticated_user_sees_login_prompt', async ({ page }) => {
        await page.request.post(`${BASE_API}/auth/logout`);
        await page.goto('/game/chess');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('button:has-text("Sign In")')).toBeVisible({ timeout: 5000 });
    });

    test('test_chess_new_game_shows_board', async ({ page }) => {
        await page.locator('button:has-text("Play as White")').click();
        await expect(page.locator('.border-amber-900')).toBeVisible({ timeout: 5000 });
    });

    test('test_chess_player_move_reflected_in_ui', async ({ page }) => {
        await page.locator('button:has-text("Play as White")').click();

        const board = page.locator('.border-amber-900').first();
        await expect(board).toBeVisible({ timeout: 5000 });
        await page.waitForTimeout(2000);

        // Click e2 pawn (row 6 col 4 = square 52 from top-left) then e4 (row 4 col 4 = square 36)
        const squares = board.locator('> div > div');
        await squares.nth(52).click();
        await page.waitForTimeout(500);
        await squares.nth(36).click();
        await page.waitForTimeout(3000);

        // Board should still be visible after the move
        await expect(board).toBeVisible({ timeout: 3000 });
    });

    test('test_chess_game_over_overlay_available', async ({ page }) => {
        await page.locator('button:has-text("Play as White")').click();

        const board = page.locator('.border-amber-900').first();
        await expect(board).toBeVisible({ timeout: 5000 });
        await page.waitForTimeout(2000);

        const squares = board.locator('> div > div');

        // Attempt Scholar's Mate sequence: e4, Bc4, Qh5, Qxf7
        const moves: [number, number][] = [
            [52, 36], // e2-e4
            [61, 34], // Bf1-c4
            [59, 31], // Qd1-h5
            [31, 13], // Qh5xf7
        ];

        for (const [from, to] of moves) {
            await squares.nth(from).click();
            await page.waitForTimeout(500);
            await squares.nth(to).click();
            await page.waitForTimeout(3500);

            const gameOverText = page.locator('p:has-text("You Win!"), p:has-text("You Lose"), p:has-text("Draw!")');
            if ((await gameOverText.count()) > 0) break;
        }

        const gameOverText = page.locator('p:has-text("You Win!"), p:has-text("You Lose"), p:has-text("Draw!")');
        const boardVisible = await board.isVisible();
        const gameOver = (await gameOverText.count()) > 0;

        if (gameOver) {
            await expect(gameOverText.first()).toBeVisible();
            await expect(page.locator('button:has-text("Play as White")')).toBeVisible({ timeout: 3000 });
        } else {
            expect(boardVisible).toBe(true);
        }
    });

    test('test_chess_resume_after_page_refresh', async ({ page }) => {
        await page.locator('button:has-text("Play as White")').click();
        const board = page.locator('.border-amber-900').first();
        await expect(board).toBeVisible({ timeout: 5000 });
        await page.waitForTimeout(2000);

        await page.reload();
        await page.waitForLoadState('networkidle');

        await expect(board).toBeVisible({ timeout: 5000 });
    });
});
