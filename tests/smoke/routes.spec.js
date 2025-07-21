const { test, expect } = require('@playwright/test');

test.describe('Route Smoke Tests', () => {
    test('homepage loads correctly', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Check title
        await expect(page).toHaveTitle(/AI Game Hub/);

        // Check main heading exists (with timeout)
        await expect(page.locator('h1')).toContainText(/Welcome to AI Game Hub|AI Game Hub/, { timeout: 10000 });

        // Check navigation exists
        await expect(page.locator('nav, .navbar')).toBeVisible({ timeout: 5000 });

        // Check hero section exists (be specific to avoid multiple matches)
        await expect(page.locator('.hero')).toBeVisible({ timeout: 5000 });

        // Check that "Get Started" button exists
        await expect(page.locator('a:has-text("Get Started")')).toBeVisible({ timeout: 5000 });
    });

    test('games page loads correctly', async ({ page }) => {
        await page.goto('/games');
        await page.waitForLoadState('networkidle');

        await expect(page).toHaveTitle(/Games.*AI Game Hub/);

        // Check main heading
        await expect(page.locator('h1')).toContainText(/All Games/, { timeout: 10000 });

        // Check featured games section exists
        await expect(page.locator('#featured-games')).toBeVisible({ timeout: 5000 });

        // Check at least one game card is visible
        await expect(page.locator('#featured-games .card').first()).toBeVisible({ timeout: 5000 });
    });

    test('about page loads correctly', async ({ page }) => {
        await page.goto('/about');
        await page.waitForLoadState('networkidle');

        await expect(page).toHaveTitle(/About.*AI Game Hub/);

        // Check main heading
        await expect(page.locator('h1')).toContainText(/About AI Game Hub/, { timeout: 10000 });

        // Check mission section exists (be specific to avoid multiple h2 matches)
        await expect(page.locator('h2:has-text("Our Mission")')).toBeVisible({ timeout: 5000 });
    });

    test('individual game pages load for active games', async ({ page }) => {
        const activeGames = ['tic-tac-toe', 'dots-and-boxes', 'connect4'];

        for (const gameId of activeGames) {
            await page.goto(`/game/${gameId}`);
            await page.waitForLoadState('networkidle');

            // Should not be a 404 or error page
            await expect(page.locator('h1')).not.toContainText(/404|Error|Not Found/, { timeout: 5000 });

            // Should contain game-specific content (breadcrumbs indicate we're on a game page)
            await expect(page.locator('.breadcrumbs')).toBeVisible({ timeout: 5000 });

            // Should have main content
            await expect(page.locator('main')).toBeVisible({ timeout: 5000 });
        }
    });

    test('coming soon games redirect to games page', async ({ page }) => {
        const comingSoonGames = ['checkers'];

        for (const gameId of comingSoonGames) {
            await page.goto(`/game/${gameId}`);
            await page.waitForLoadState('networkidle');

            // Should redirect to games page
            await expect(page.url()).toContain('/games');

            // Should highlight the coming soon game
            await expect(page.url()).toContain(`highlight=${gameId}`);
        }
    });

    test('invalid game routes return 404', async ({ page }) => {
        await page.goto('/game/nonexistent-game');
        await page.waitForLoadState('networkidle');

        // Should be 404 page (check just the h1 since we can see it contains "404 ERROR")
        await expect(page.locator('h1')).toContainText(/404|Not Found|Error/, { timeout: 5000 });
    });

    test('API health endpoint works', async ({ page }) => {
        const response = await page.request.get('/api/health');
        expect(response.ok()).toBeTruthy();

        const data = await response.json();
        expect(data.status).toBe('OK');
        expect(data.message).toContain('Server is running');
    });

    test('API games endpoint returns game data', async ({ page }) => {
        const response = await page.request.get('/api/games');
        expect(response.ok()).toBeTruthy();

        const data = await response.json();
        expect(Array.isArray(data.games)).toBeTruthy();
        expect(data.games.length).toBeGreaterThan(0);

        // Check first game has expected structure
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