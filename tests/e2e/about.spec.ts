import { test, expect } from '@playwright/test';

test.describe('About page', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/about');
        await page.waitForLoadState('networkidle');
    });

    test('loads and displays stats with donation links', async ({ page }) => {
        await expect(page.locator('h1')).toContainText('About');

        const statsSection = page.locator('text=Platform Stats');
        await expect(statsSection).toBeVisible();

        await expect(page.locator('text=Games Played')).toBeVisible();
        await expect(page.locator('text=Moves Analyzed')).toBeVisible();
        await expect(page.locator('text=Players')).toBeVisible();
        await expect(page.locator('text=AI Win Rate')).toBeVisible();

        const coffeeLink = page.locator('a:has-text("Buy us a coffee")');
        await expect(coffeeLink).toBeVisible();
        await expect(coffeeLink).toHaveAttribute('target', '_blank');

        const patreonLink = page.locator('a:has-text("Support on Patreon")');
        await expect(patreonLink).toBeVisible();
        await expect(patreonLink).toHaveAttribute('target', '_blank');
    });

    test('shows team section with member cards', async ({ page }) => {
        await expect(page.locator('text=Meet the Team')).toBeVisible();

        const cards = page.locator('.card:has(.avatar)');
        await expect(cards).toHaveCount(2);

        const firstCard = cards.first();
        await expect(firstCard.locator('h3')).toBeVisible();
        await expect(firstCard.locator('a:has-text("GitHub")')).toBeVisible();
        await expect(firstCard.locator('a:has-text("LinkedIn")')).toBeVisible();
    });
});
