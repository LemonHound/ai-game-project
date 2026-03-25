const { test, expect } = require('@playwright/test');

test.describe('Route Smoke Tests', () => {
    test('homepage loads correctly', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        await expect(page).toHaveTitle(/AI Game Hub/);
        await expect(page.locator('h1')).toContainText('AI Game Hub', { timeout: 10000 });
        await expect(page.locator('.navbar').first()).toBeVisible({ timeout: 5000 });
        await expect(page.locator('.hero')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('a:has-text("Browse Games")')).toBeVisible({ timeout: 5000 });
    });

    test('games page loads correctly', async ({ page }) => {
        await page.goto('/games');
        await page.waitForLoadState('networkidle');

        await expect(page).toHaveTitle(/AI Game Hub/);
        await expect(page.locator('h1')).toContainText('Games', { timeout: 10000 });
        await expect(page.locator('.card').first()).toBeVisible({ timeout: 10000 });
    });

    test('about page loads correctly', async ({ page }) => {
        await page.goto('/about');
        await page.waitForLoadState('networkidle');

        await expect(page).toHaveTitle(/AI Game Hub/);
        await expect(page.locator('h1')).toContainText('About', { timeout: 10000 });
    });

    test('individual game pages load for active games', async ({ page }) => {
        const activeGames = ['tic-tac-toe', 'dots-and-boxes', 'connect4'];

        for (const gameId of activeGames) {
            await page.goto(`/game/${gameId}`);
            await page.waitForLoadState('networkidle');

            await expect(page.locator('h1')).not.toContainText(/404|Error|Not Found/, { timeout: 5000 });
            await expect(page.locator('main')).toBeVisible({ timeout: 5000 });
        }
    });

    test('invalid game routes return 404', async ({ page }) => {
        await page.goto('/game/nonexistent-game');
        await page.waitForLoadState('networkidle');

        await expect(page.locator('h1')).toContainText(/404|Not Found|Error/, { timeout: 5000 });
    });

    test('API health endpoint works', async ({ page }) => {
        const response = await page.request.get('/api/health');
        expect(response.ok()).toBeTruthy();

        const data = await response.json();
        expect(data.status).toBe('OK');
    });

    test('API games endpoint returns game data', async ({ page }) => {
        const response = await page.request.get('/api/games_list');
        expect(response.ok()).toBeTruthy();

        const data = await response.json();
        expect(Array.isArray(data.games)).toBeTruthy();
        expect(data.games.length).toBeGreaterThan(0);
        expect(data.games[0]).toHaveProperty('id');
        expect(data.games[0]).toHaveProperty('name');
        expect(data.games[0]).toHaveProperty('status');
    });

    test('database connection works', async ({ page }) => {
        const response = await page.request.get('/api/test-db');
        expect(response.ok()).toBeTruthy();

        const data = await response.json();
        expect(data.status).toContain('Database connected');
        expect(data).toHaveProperty('userCount');
    });
});
