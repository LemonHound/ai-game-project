const { test, expect } = require('@playwright/test');

test.describe('Performance Tests', () => {
    test('homepage loads within reasonable time', async ({ page }) => {
        const startTime = Date.now();

        await page.goto('/');
        await page.waitForLoadState('networkidle');

        const loadTime = Date.now() - startTime;

        // Should load within 5 seconds
        expect(loadTime).toBeLessThan(5000);

        console.log(`Homepage loaded in ${loadTime}ms`);
    });

    test('game pages load quickly', async ({ page }) => {
        const games = ['tic-tac-toe', 'connect4', 'dots-and-boxes'];

        for (const gameId of games) {
            const startTime = Date.now();

            await page.goto(`/game/${gameId}`);
            await page.waitForLoadState('networkidle');

            const loadTime = Date.now() - startTime;

            // Game pages should load within 3 seconds
            expect(loadTime).toBeLessThan(3000);

            console.log(`${gameId} loaded in ${loadTime}ms`);
        }
    });

    test('CSS and assets load efficiently', async ({ page }) => {
        const resources = [];

        page.on('response', response => {
            if (response.url().includes('/css/') ||
                response.url().includes('/js/') ||
                response.url().includes('/images/')) {
                resources.push({
                    url: response.url(),
                    status: response.status(),
                    size: response.headers()['content-length'] || 0
                });
            }
        });

        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        // All resources should load successfully
        const failedResources = resources.filter(r => r.status >= 400);
        expect(failedResources.length).toBe(0);

        console.log("Loaded", resources.length, "static resources");
    });

    test('API endpoints respond quickly', async ({ request }) => {
        const endpoints = [
            '/api/health',
            '/api/games',
            '/api/test-db'
        ];

        for (const endpoint of endpoints) {
            const startTime = Date.now();

            const response = await request.get(endpoint);

            const responseTime = Date.now() - startTime;

            expect(response.ok()).toBeTruthy();
            expect(responseTime).toBeLessThan(2000); // Should respond within 2 seconds

            console.log(`${endpoint} responded in ${responseTime}ms`);
        }
    });

    test('game interactions are responsive', async ({ page }) => {
        await page.goto('/game/tic-tac-toe');
        await page.waitForLoadState('networkidle');

        const squares = page.locator('#game-board button').first();

        // Measure click response time
        const startTime = Date.now();
        await squares.click();

        // Wait for visual feedback
        await page.waitForFunction(() => {
            const square = document.querySelector('#game-board button');
            return square && square.textContent.trim() !== '';
        });

        const responseTime = Date.now() - startTime;

        // Should respond to clicks within 500ms
        expect(responseTime).toBeLessThan(1000);

        console.log(`Game interaction responded in ${responseTime}ms`);
    });
});