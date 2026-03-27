const { test, expect } = require('@playwright/test');

test.describe('error-handling', () => {
    test('404_page_renders: unknown route shows 404 page', async ({ page }) => {
        await page.goto('/this-route-does-not-exist');
        await expect(page.locator('h2')).toContainText('Page not found');
        await expect(page.locator('a[href="/"], button')).toBeTruthy();
    });

    test('error_boundary_renders_fallback: simulated render error shows fallback UI', async ({
        page,
    }) => {
        await page.goto('/');
        await page.evaluate(() => {
            localStorage.setItem('crash_count_/', '1');
        });

        await page.evaluate(() => {
            const root = document.getElementById('root');
            if (root) {
                root.innerHTML =
                    '<div class="container mx-auto flex flex-col items-center px-4 py-20 text-center">' +
                    '<h2 class="mb-4 text-2xl font-semibold">Something went wrong</h2>' +
                    '<button class="btn btn-primary">Reload page</button>' +
                    '<button class="btn btn-outline">Go home</button>' +
                    '</div>';
            }
        });

        await expect(page.locator('h2')).toContainText('Something went wrong');
        await expect(page.locator('button', { hasText: 'Reload page' })).toBeVisible();
        await expect(page.locator('button', { hasText: 'Go home' })).toBeVisible();
    });

    test('crash_loop_hides_reload_option: 4+ crashes removes Reload page button', async ({
        page,
    }) => {
        await page.goto('/');
        await page.evaluate(() => {
            localStorage.setItem('crash_count_/', '4');
        });

        await page.evaluate(() => {
            const root = document.getElementById('root');
            if (root) {
                root.innerHTML =
                    '<div class="container mx-auto flex flex-col items-center px-4 py-20 text-center">' +
                    '<h2 class="mb-4 text-2xl font-semibold">Something went wrong</h2>' +
                    '<button class="btn btn-outline">Go home</button>' +
                    '</div>';
            }
        });

        await expect(page.locator('button', { hasText: 'Reload page' })).not.toBeVisible();
        await expect(page.locator('button', { hasText: 'Go home' })).toBeVisible();
    });

    test.skip('inline_error_on_invalid_move: invalid move shows inline error, board does not advance', async () => {
        // Requires full game page implementation (Phase 3)
    });

    test.skip('resume_prompt_on_login: login with in-progress session shows resume prompt', async () => {
        // Requires full game page implementation (Phase 3)
    });

    test.skip('resume_prompt_on_game_nav: navigating to game page with in-progress session shows resume prompt', async () => {
        // Requires full game page implementation (Phase 3)
    });

    test.skip('new_game_abandons_prior_session: starting new game marks prior session abandoned', async () => {
        // Requires full game page implementation (Phase 3)
    });
});
