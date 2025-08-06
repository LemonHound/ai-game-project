const { test, expect } = require('@playwright/test');

test.describe('Performance Tests', () => {
    test('homepage loads within reasonable time', async ({ page }) => {
        const startTime = Date.now();

        await page.goto('/');
        await page.waitForLoadState('networkidle');

        const loadTime = Date.now() - startTime;

        // Should load within 5 seconds
        expect(loadTime).toBeLessThan(5000);
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
        }
    });

    test('API endpoints respond quickly', async ({ request }) => {
        const endpoints = ['/api/health', '/api/games', '/api/test-db'];

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
        // First, authenticate the user
        await page.goto('/');
        const { loginWithDemo } = require('../helpers/test-utils');
        await loginWithDemo(page);

        // Now navigate to the game
        await page.goto('/game/tic-tac-toe');
        await page.waitForLoadState('networkidle');

        // Wait for the game to initialize and authenticate
        // The AI thoughts element will show "Ready for a new game! Make your first move." when ready
        await page.waitForFunction(
            () => {
                const aiThoughts = document.getElementById('ai-thoughts');
                return (
                    aiThoughts &&
                    (aiThoughts.textContent.includes('Ready for a new game') ||
                        aiThoughts.textContent.includes('Make your first move') ||
                        aiThoughts.textContent.includes('Your turn'))
                );
            },
            { timeout: 15000 }
        );

        // Wait for the board to be created with all 9 squares
        await page.waitForFunction(
            () => {
                const squares = document.querySelectorAll('[data-index]');
                return squares.length === 9;
            },
            { timeout: 5000 }
        );

        const firstSquare = page.locator('[data-index="0"]');

        // Measure click response time
        const startTime = Date.now();

        // Click the square
        await firstSquare.click({ force: true });

        // Wait for visual feedback - the square should show 'X'
        await page.waitForFunction(
            () => {
                const square = document.querySelector('[data-index="0"]');
                return square && square.textContent.trim() === 'X';
            },
            { timeout: 5000 }
        );

        const responseTime = Date.now() - startTime;

        // Should respond to clicks within 3000ms (reasonable for CI with auth)
        expect(responseTime).toBeLessThan(3000);

        console.log(`Game interaction responded in ${responseTime}ms`);

        // Verify the square actually contains 'X'
        await expect(firstSquare).toContainText('X');
    });
});
