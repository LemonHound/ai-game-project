import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:8000/api';

test.describe('about stats', () => {
    test('GET /api/about/stats returns 200 with all required fields', async ({ request }) => {
        const res = await request.get(`${BASE}/about/stats`);
        expect(res.status()).toBe(200);

        const data = await res.json();
        expect(typeof data.games_played).toBe('number');
        expect(typeof data.moves_analyzed).toBe('number');
        expect(typeof data.registered_players).toBe('number');
        expect(typeof data.unique_players).toBe('number');
        expect(typeof data.ai_win_rate).toBe('number');
        expect(typeof data.player_win_rate).toBe('number');
        expect(typeof data.avg_moves_per_game).toBe('number');
        expect(typeof data.days_running).toBe('number');
        expect(typeof data.monthly_cost_usd).toBe('number');
        expect(data.training_moves).toBeUndefined();
    });

    test('stats values are non-negative', async ({ request }) => {
        const res = await request.get(`${BASE}/about/stats`);
        const data = await res.json();

        expect(data.games_played).toBeGreaterThanOrEqual(0);
        expect(data.moves_analyzed).toBeGreaterThanOrEqual(0);
        expect(data.registered_players).toBeGreaterThanOrEqual(0);
        expect(data.unique_players).toBeGreaterThanOrEqual(0);
        expect(data.ai_win_rate).toBeGreaterThanOrEqual(0);
        expect(data.ai_win_rate).toBeLessThanOrEqual(1);
        expect(data.player_win_rate).toBeGreaterThanOrEqual(0);
        expect(data.player_win_rate).toBeLessThanOrEqual(1);
        expect(data.avg_moves_per_game).toBeGreaterThanOrEqual(0);
        expect(data.days_running).toBeGreaterThanOrEqual(0);
        expect(data.monthly_cost_usd).toBeGreaterThanOrEqual(0);
    });
});
