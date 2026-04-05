import { test, expect } from '@playwright/test';

test.describe('SEO Meta Tags', () => {
    test('Home page has correct title and meta tags', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveTitle(/AI Game Hub/);

        const description = page.locator('meta[name="description"]').first();
        await expect(description).toHaveAttribute('content', /adaptive AI/);

        const ogTitle = page.locator('meta[property="og:title"]').first();
        await expect(ogTitle).toHaveAttribute('content', /AI Game Hub/);

        const ogImage = page.locator('meta[property="og:image"]').first();
        await expect(ogImage).toHaveAttribute('content', /og-home\.png/);

        const ogType = page.locator('meta[property="og:type"]').first();
        await expect(ogType).toHaveAttribute('content', 'website');
    });

    test('Games page has correct meta description', async ({ page }) => {
        await page.goto('/games');
        await expect(page).toHaveTitle(/Games.*AI Game Hub/);

        const description = page.locator('meta[name="description"][content*="Browse all available games"]');
        await expect(description).toBeAttached();
    });

    test('Game page has noindex meta tag', async ({ page }) => {
        await page.goto('/game/tic-tac-toe');
        await page.waitForLoadState('domcontentloaded');

        const robots = page.locator('meta[name="robots"][content="noindex"]');
        await expect(robots).toBeAttached({ timeout: 10000 });
    });

    test('About page has correct OG image', async ({ page }) => {
        await page.goto('/about');
        await expect(page).toHaveTitle(/About.*AI Game Hub/);

        const ogImage = page.locator('meta[property="og:image"][content*="og-about"]');
        await expect(ogImage).toBeAttached();
    });
});
