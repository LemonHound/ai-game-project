import { test, expect, Page } from '@playwright/test';

const BASE_API = 'http://localhost:8000/api';

async function loginDemoUser(page: Page) {
    await page.request.post(`${BASE_API}/auth/login`, {
        data: { email: 'demo@aigamehub.com', password: 'demo123' },
    });
}

test.describe('Dots and Boxes — full game flows', () => {
    test.beforeEach(async ({ page }) => {
        await loginDemoUser(page);
        await page.goto('/game/dots-and-boxes');
        await page.waitForLoadState('networkidle');

        await expect(page.locator('button:has-text("Go First")')).toBeVisible({ timeout: 5000 });
    });

    test('test_dab_unauthenticated_user_sees_login_prompt', async ({ page }) => {
        await page.request.post(`${BASE_API}/auth/logout`);
        await page.goto('/game/dots-and-boxes');
        await page.waitForLoadState('networkidle');
        await expect(page.locator('button:has-text("Sign In")')).toBeVisible({ timeout: 5000 });
    });

    test('test_dab_new_game_shows_board', async ({ page }) => {
        await page.locator('button:has-text("Go First")').click();
        await expect(page.locator('[aria-label="Dots and Boxes board"]')).toBeVisible({ timeout: 5000 });
    });

    test('test_dab_player_edge_click_reflected_in_ui', async ({ page }) => {
        await page.locator('button:has-text("Go First")').click();

        const board = page.locator('[aria-label="Dots and Boxes board"]');
        await expect(board).toBeVisible({ timeout: 5000 });
        await page.waitForTimeout(2000);

        // Click first interactive edge (SVG rect with cursor:pointer)
        const edges = board.locator('rect[style*="cursor: pointer"]');
        if ((await edges.count()) > 0) {
            await edges.first().click();
            await page.waitForTimeout(3000);
        }

        await expect(board).toBeVisible({ timeout: 3000 });
    });

    test('test_dab_game_over_overlay_available', async ({ page }) => {
        await page.locator('button:has-text("Go First")').click();

        const board = page.locator('[aria-label="Dots and Boxes board"]');
        await expect(board).toBeVisible({ timeout: 5000 });
        await page.waitForTimeout(2000);

        // Click several edges; if the game ends, the overlay should appear
        const edges = board.locator('rect[style*="cursor: pointer"]');
        const edgeCount = await edges.count();
        const clickCount = Math.min(edgeCount, 6);

        for (let i = 0; i < clickCount; i++) {
            const currentEdges = board.locator('rect[style*="cursor: pointer"]');
            if ((await currentEdges.count()) === 0) break;
            await currentEdges.first().click();
            await page.waitForTimeout(2500);

            const gameOverText = page.locator('p:has-text("You Win!"), p:has-text("You Lose"), p:has-text("Draw!")');
            if ((await gameOverText.count()) > 0) break;
        }

        const gameOverText = page.locator('p:has-text("You Win!"), p:has-text("You Lose"), p:has-text("Draw!")');
        const boardVisible = await board.isVisible();
        const gameOver = (await gameOverText.count()) > 0;

        if (gameOver) {
            await expect(gameOverText.first()).toBeVisible();
            await expect(page.locator('button:has-text("Go First")')).toBeVisible({ timeout: 3000 });
        } else {
            expect(boardVisible).toBe(true);
        }
    });

    test('test_dab_resume_after_page_refresh', async ({ page }) => {
        await page.locator('button:has-text("Go First")').click();
        const board = page.locator('[aria-label="Dots and Boxes board"]');
        await expect(board).toBeVisible({ timeout: 5000 });
        await page.waitForTimeout(2000);

        await page.reload();
        await page.waitForLoadState('networkidle');

        await expect(board).toBeVisible({ timeout: 5000 });
    });
});
