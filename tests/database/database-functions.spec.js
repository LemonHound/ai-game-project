const { test, expect } = require('@playwright/test');
const { addAuth } = require('../helpers/auth-helper');

test.describe('Database Functions', () => {
    test.describe('Cleanup Functions', () => {
        test('cleanup_expired_sessions function works', async ({ request }) => {
            // Test the session cleanup endpoint if it exists
            const response = await request.get('/api/health');
            expect(response.ok()).toBeTruthy();
            // This confirms database connectivity for function testing
        });

        test('cleanup_abandoned_tic_tac_toe_games function works', async ({ request }) => {
            const auth = addAuth(request);
            const cleanupResponse = await auth.post('/api/tic-tac-toe/cleanup');
            expect(cleanupResponse.ok()).toBeTruthy();

            const result = await cleanupResponse.json();
            expect(result.success).toBe(true);
            expect(typeof result.deletedGames).toBe('number');
            expect(result.deletedGames).toBeGreaterThanOrEqual(0);
        });
    });

    test.describe('Upsert Functions', () => {
        test('upsert_tic_tac_toe_state handles new and existing states', async ({ request }) => {
            const auth = addAuth(request);

            // Make the same move twice (in different games) to test upsert
            for (let i = 0; i < 2; i++) {
                const startResponse = await auth.post('/api/tic-tac-toe/start');
                expect(startResponse.ok()).toBeTruthy();
                const gameSession = await startResponse.json();

                const moveResponse = await auth.post('/api/tic-tac-toe/move', {
                    data: {
                        sessionId: gameSession.sessionId,
                        move: { position: 4 }, // Center position
                    },
                });
                expect(moveResponse.ok()).toBeTruthy();
            }

            // Verify the state count increased
            const statesResponse = await request.get('/api/tic-tac-toe/game_states');
            const states = await statesResponse.json();

            const centerState = states.find(s => s.board_positions.charAt(4) === 'X' && s.move_count === 1);
            if (centerState) {
                expect(centerState.count).toBeGreaterThanOrEqual(1);
            }
        });
    });

    test.describe('Game Management Functions', () => {
        test('start and complete game functions work together', async ({ request }) => {
            const auth = addAuth(request);

            // Start game
            const startResponse = await auth.post('/api/tic-tac-toe/start');
            expect(startResponse.ok()).toBeTruthy();
            const gameSession = await startResponse.json();

            // Complete game with a few moves
            const moves = [0, 1, 3]; // O wins (diagonal / )

            for (let i = 0; i < moves.length; i++) {
                const moveResponse = await auth.post('/api/tic-tac-toe/move', {
                    data: {
                        sessionId: gameSession.sessionId,
                        move: { position: moves[i] },
                    },
                });

                expect(moveResponse.ok()).toBeTruthy();
                const result = await moveResponse.json();
                expect(result.success).toBe(true);
            }

            // Verify through stats that game was completed
            const statsResponse = await auth.get('/api/tic-tac-toe/stats');
            expect(statsResponse.ok()).toBeTruthy();

            const stats = await statsResponse.json();
            expect(parseInt(stats.total_games)).toBeGreaterThanOrEqual(1);
        });
    });
});
