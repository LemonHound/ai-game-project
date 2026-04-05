import { test, expect } from '@playwright/test';

test.describe('SEO API Endpoints', () => {
    test('GET /robots.txt returns valid content', async ({ request }) => {
        const response = await request.get('/robots.txt');
        expect(response.ok()).toBeTruthy();
        expect(response.headers()['content-type']).toContain('text/plain');

        const body = await response.text();
        expect(body).toContain('User-agent: *');
        expect(body).toContain('Disallow: /api/');
        expect(body).toContain('Disallow: /profile');
        expect(body).toContain('Disallow: /settings');
        expect(body).toContain('Disallow: /game/');
        expect(body).toContain('Sitemap:');
    });

    test('GET /sitemap.xml returns valid XML', async ({ request }) => {
        const response = await request.get('/sitemap.xml');
        expect(response.ok()).toBeTruthy();
        expect(response.headers()['content-type']).toContain('application/xml');

        const body = await response.text();
        expect(body).toContain('<?xml version="1.0"');
        expect(body).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
        expect(body).toContain('<loc>');

        const locMatches = body.match(/<loc>/g);
        expect(locMatches).toHaveLength(3);

        expect(body).toMatch(/<loc>.*\/<\/loc>/);
        expect(body).toContain('/games</loc>');
        expect(body).toContain('/about</loc>');
    });
});
