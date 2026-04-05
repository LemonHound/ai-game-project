import { describe, expect, it } from 'vitest';
import { fetchGames } from './games';

describe('games api', () => {
    it('fetchGames returns game list', async () => {
        const games = await fetchGames('active');
        expect(games).toHaveLength(2);
        expect(games[0].id).toBe('tic-tac-toe');
        expect(games[1].id).toBe('chess');
    });

    it('games have required fields', async () => {
        const games = await fetchGames();
        for (const game of games) {
            expect(game).toHaveProperty('id');
            expect(game).toHaveProperty('name');
            expect(game).toHaveProperty('description');
        }
    });
});
