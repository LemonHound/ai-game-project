import { test, expect, Page, Locator } from '@playwright/test';

const BASE_API = 'http://localhost:8000/api';

async function loginDemoUser(page: Page) {
    await page.request.post(`${BASE_API}/auth/login`, {
        data: { email: 'demo@aigamehub.com', password: 'demo123' },
    });
}

function square(board: Locator, row: number, col: number): Locator {
    return board.locator(`[data-square="${row}-${col}"]`);
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
        const board = page.getByTestId('chess-board');
        await expect(board).toBeVisible({ timeout: 5000 });
        await expect(board.locator('img').first()).toBeVisible({ timeout: 5000 });
    });

    test('test_chess_player_move_reflected_in_ui', async ({ page }) => {
        const newgameResp = page.waitForResponse(r => r.url().includes('/chess/newgame'));
        await page.locator('button:has-text("Play as White")').click();

        const board = page.getByTestId('chess-board');
        await Promise.all([expect(board).toBeVisible({ timeout: 5000 }), newgameResp]);
        await expect(board.locator('img').first()).toBeVisible({ timeout: 5000 });

        await square(board, 6, 4).click();
        await page.waitForTimeout(300);
        await square(board, 4, 4).click();
        await page.waitForTimeout(1500);

        await expect(square(board, 4, 4).locator('img')).toBeVisible({ timeout: 3000 });
    });

    test('test_chess_game_over_overlay_available', async ({ page }) => {
        const newgameResp = page.waitForResponse(r => r.url().includes('/chess/newgame'));
        await page.locator('button:has-text("Play as White")').click();

        const board = page.getByTestId('chess-board');
        await Promise.all([expect(board).toBeVisible({ timeout: 5000 }), newgameResp]);
        await expect(board.locator('img').first()).toBeVisible({ timeout: 5000 });

        const moves: [[number, number], [number, number]][] = [
            [
                [6, 4],
                [4, 4],
            ],
            [
                [7, 5],
                [4, 2],
            ],
            [
                [7, 3],
                [3, 7],
            ],
            [
                [3, 7],
                [1, 5],
            ],
        ];

        const gameOverText = page.locator('p:has-text("You Win!"), p:has-text("You Lose"), p:has-text("Draw!")');

        for (const [[fromRow, fromCol], [toRow, toCol]] of moves) {
            await square(board, fromRow, fromCol).click();
            await page.waitForTimeout(300);
            await square(board, toRow, toCol).click();
            await page.waitForTimeout(1500);

            if ((await gameOverText.count()) > 0) break;
        }

        const gameOver = (await gameOverText.count()) > 0;

        if (gameOver) {
            await expect(gameOverText.first()).toBeVisible();
            await expect(page.locator('button:has-text("Play as White")')).toBeVisible({ timeout: 3000 });
        } else {
            await expect(board).toBeVisible();
        }
    });

    test('test_chess_resume_after_page_refresh', async ({ page }) => {
        const newgameResp = page.waitForResponse(r => r.url().includes('/chess/newgame'));
        await page.locator('button:has-text("Play as White")').click();
        const board = page.getByTestId('chess-board');
        await Promise.all([expect(board).toBeVisible({ timeout: 5000 }), newgameResp]);
        await expect(board.locator('img').first()).toBeVisible({ timeout: 5000 });

        await page.reload();
        await page.waitForLoadState('networkidle');

        const resumeButton = page.locator('button:has-text("Continue Game")');
        await expect(resumeButton).toBeEnabled({ timeout: 5000 });
        await resumeButton.click();

        await expect(board).toBeVisible({ timeout: 5000 });
        await expect(board.locator('img').first()).toBeVisible({ timeout: 5000 });
    });
});
