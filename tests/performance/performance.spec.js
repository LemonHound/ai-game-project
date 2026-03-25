const { test, expect } = require('@playwright/test');

test.describe('Performance Tests', () => {
    test('homepage loads within reasonable time', async ({ page }) => {
        const startTime = Date.now();

        await page.goto('/');
        await page.waitForLoadState('networkidle');

        const loadTime = Date.now() - startTime;

        expect(loadTime).toBeLessThan(5000);
    });

    test('game pages load quickly', async ({ page }) => {
        const games = ['tic-tac-toe', 'connect4', 'dots-and-boxes'];

        for (const gameId of games) {
            const startTime = Date.now();

            await page.goto(`/game/${gameId}`);
            await page.waitForLoadState('networkidle');

            const loadTime = Date.now() - startTime;

            expect(loadTime).toBeLessThan(3000);
        }
    });

    test('API endpoints respond quickly', async ({ request }) => {
        const endpoints = ['/api/health', '/api/games_list', '/api/test-db'];

        for (const endpoint of endpoints) {
            const startTime = Date.now();

            const response = await request.get(endpoint);

            const responseTime = Date.now() - startTime;

            expect(response.ok()).toBeTruthy();
            expect(responseTime).toBeLessThan(2000);
        }
    });

    test.skip('game interactions are responsive', async ({ page }) => {
        // Skipped: pending React game component wiring
        // Old test relied on #ai-thoughts and [data-index] selectors from vanilla JS implementation
    });
});
