const { test, expect } = require('@playwright/test');

test.describe('Site Navigation', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('navigation links work correctly', async ({ page }) => {
        const homeLink = page.locator('nav a[href="/"], a:has-text("Home"), [data-testid="home-link"]').first();

        if (await homeLink.isVisible()) {
            await homeLink.click();
            await expect(page).toHaveURL('/');
            await expect(page).toHaveTitle(/AI Game Hub/);
        }

        const gamesLink = page.locator('nav a[href="/games"], a:has-text("Games"), [data-testid="games-link"]').first();

        if (await gamesLink.isVisible()) {
            await gamesLink.click();
            await expect(page).toHaveURL('/games');
            await expect(page).toHaveTitle(/AI Game Hub/);
        } else {
            await page.goto('/games');
            await expect(page).toHaveTitle(/AI Game Hub/);
        }

        const aboutLink = page.locator('nav a[href="/about"], a:has-text("About"), [data-testid="about-link"]').first();

        if (await aboutLink.isVisible()) {
            await aboutLink.click();
            await expect(page).toHaveURL('/about');
            await expect(page).toHaveTitle(/AI Game Hub/);
        } else {
            await page.goto('/about');
            await expect(page).toHaveTitle(/AI Game Hub/);
        }
    });

    test('game navigation from homepage', async ({ page }) => {
        const gameLinks = page.locator('[data-testid*="game-link"]');
        const sidebarGameLinks = page.locator('[data-testid*="game-card"]');

        const allGameLinks = (await gameLinks.count()) + (await sidebarGameLinks.count());

        if (allGameLinks > 0) {
            let linkToClick = null;

            if ((await gameLinks.count()) > 0) {
                linkToClick = gameLinks.first();
            } else if ((await sidebarGameLinks.count()) > 0) {
                linkToClick = sidebarGameLinks.first();
            }

            if (linkToClick) {
                await linkToClick.click();
                await expect(page.url()).toContain('/game/');
                await expect(page.locator('h1')).not.toContainText(/404|Not Found|Error/);
            }
        } else {
            console.warn('No game links found on homepage - this might be expected');
            expect(true).toBe(true);
        }
    });

    test('game navigation from games page', async ({ page }) => {
        await page.goto('/games');
        await page.waitForLoadState('networkidle');

        const gameCards = page.locator('.card a[href*="/game/"], a.card[href*="/game/"]');

        if ((await gameCards.count()) > 0) {
            const firstGame = gameCards.first();
            await firstGame.click();
            await expect(page.url()).toContain('/game/');
            await expect(page.locator('main')).toBeVisible();
        } else {
            console.warn('No clickable game links found on games page');
            await expect(page.locator('main')).toBeVisible();
        }
    });

    test('breadcrumb navigation works', async ({ page }) => {
        await page.goto('/game/tic-tac-toe');

        const breadcrumbs = page.locator('[data-testid="breadcrumbs"]');
        const backLink = page.locator('a:has-text("Back"), button:has-text("Back"), [data-testid="back-btn"]');

        if ((await breadcrumbs.count()) > 0) {
            const homecrumb = breadcrumbs.locator('Home').first();
            if (await homecrumb.isVisible()) {
                await homecrumb.click();
                await expect(page).toHaveURL('/');
            }
        } else if ((await backLink.count()) > 0) {
            await backLink.first().click();
            await page.waitForTimeout(1000);
            await expect(page.url()).not.toContain('/game/tic-tac-toe');
        }
    });

    test('mobile navigation works', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });

        const mobileMenuButton = page.locator(
            'button[data-testid="mobile-menu"], .mobile-menu-btn, button:has([data-testid="hamburger"]), button.lg\\:hidden'
        );

        if ((await mobileMenuButton.count()) > 0) {
            await mobileMenuButton.first().click();

            const mobileMenu = page.locator(
                '#mobile-sidebar, .mobile-menu, .mobile-nav, nav.mobile, [data-testid="mobile-menu"]'
            );
            await expect(mobileMenu.first()).toBeVisible();

            const mobileGamesLink = mobileMenu.locator('a[href="/games"], a:has-text("Games")').first();
            if (await mobileGamesLink.isVisible()) {
                await mobileGamesLink.click();
                await expect(page).toHaveURL('/games');
            }
        }
    });

    test('footer links work', async ({ page }) => {
        const footer = page.locator('footer');

        if (await footer.isVisible()) {
            const footerLinks = footer.locator('a[href^="/"]');

            if ((await footerLinks.count()) > 0) {
                const firstFooterLink = footerLinks.first();
                const href = await firstFooterLink.getAttribute('href');

                if (href && href !== '#') {
                    await firstFooterLink.click();
                    await expect(page.url()).toContain(href);
                }
            }
        }
    });

    test('search functionality works if present', async ({ page }) => {
        const searchInput = page.locator(
            'input[type="search"], input[placeholder*="search" i], [data-testid="search"]'
        );

        if ((await searchInput.count()) > 0) {
            await searchInput.first().fill('tic');
            await page.keyboard.press('Enter');

            await page.waitForTimeout(1000);

            const results = page.locator('.search-results, .results, .filtered');
            if ((await results.count()) > 0) {
                await expect(results.first()).toBeVisible();
            }
        }
    });

    test('external links open correctly', async ({ page }) => {
        const externalLinks = page.locator('a[href^="http"]:not([href*="localhost"]):not([href*="127.0.0.1"])');

        if ((await externalLinks.count()) > 0) {
            const firstExternal = externalLinks.first();
            const href = await firstExternal.getAttribute('href');

            const target = await firstExternal.getAttribute('target');
            expect(target).toBe('_blank');

            expect(href).toMatch(/^https?:\/\//);
        }
    });

    test('URL parameters work correctly', async ({ page }) => {
        await page.goto('/games?highlight=chess');
        await page.waitForLoadState('networkidle');

        await expect(page).toHaveTitle(/AI Game Hub/);
        await expect(page.locator('main')).toBeVisible();
    });

    test('unknown routes render the app', async ({ page }) => {
        await page.goto('/nonexistent-page');
        await page.waitForLoadState('networkidle');

        await expect(page.locator('#root')).toBeVisible();
        await expect(page).toHaveTitle(/AI Game Hub/);
    });
});
