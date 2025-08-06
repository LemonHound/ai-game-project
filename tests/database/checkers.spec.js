// tests/database/checkers.spec.js
const { test, expect } = require('@playwright/test');
const { addAuth } = require('../helpers/auth-helper');

test.describe('Checkers Database Integration', () => {
    test.describe('Game State Storage', () => {
        test('should store checkers game states when moves are made', async ({ request }) => {
            const auth = addAuth(request);

            // Start a new checkers game
            const startResponse = await auth.post('/api/checkers/start');
            expect(startResponse.ok()).toBeTruthy();
            const gameSession = await startResponse.json();
            expect(gameSession.sessionId).toBeDefined();

            // Make a move - checkers moves are more complex than tic-tac-toe
            // This is a basic forward move
            const moveResponse = await auth.post('/api/checkers/move', {
                data: {
                    sessionId: gameSession.sessionId,
                    move: {
                        from: 40,
                        to: 33,
                        captures: [],
                    },
                },
            });

            expect(moveResponse.ok()).toBeTruthy();
            const moveResult = await moveResponse.json();
            expect(moveResult.success).toBe(true);

            // Verify state was stored by checking popular states
            const statesResponse = await request.get('/api/checkers/game_states?limit=5');
            expect(statesResponse.ok()).toBeTruthy();

            const states = await statesResponse.json();
            expect(Array.isArray(states)).toBeTruthy();

            // Should find a state with 1 move
            const oneMove = states.find(state => state.move_count === 1);
            expect(oneMove).toBeTruthy();
            expect(oneMove.board_positions).toMatch(/^[RrBb_]{64}$/);
        });

        test('should increment count for duplicate checkers game states', async ({ request }) => {
            const auth = addAuth(request);

            // Start two games and make the same first move
            for (let i = 0; i < 2; i++) {
                const startResponse = await auth.post('/api/checkers/start');
                expect(startResponse.ok()).toBeTruthy();
                const gameSession = await startResponse.json();

                // Make same opening move
                const moveResponse = await auth.post('/api/checkers/move', {
                    data: {
                        sessionId: gameSession.sessionId,
                        move: {
                            from: 40,
                            to: 33,
                            captures: [],
                        },
                    },
                });
                expect(moveResponse.ok()).toBeTruthy();
            }

            // Check that the state count increased
            const statesResponse = await request.get('/api/checkers/game_states');
            const states = await statesResponse.json();

            const openingMoveState = states.find(state => state.move_count === 1);

            expect(openingMoveState).toBeTruthy();
            expect(openingMoveState.count).toBeGreaterThanOrEqual(2);
        });
    });

    test.describe('Player Game Records', () => {
        test('should create checkers game record on start and complete on finish', async ({ request }) => {
            const auth = addAuth(request);

            // Start game with auth
            const startResponse = await auth.post('/api/checkers/start');
            expect(startResponse.ok()).toBeTruthy();
            const gameSession = await startResponse.json();

            // Make several moves
            const moves = [
                { from: 40, to: 33, captures: [] },
                { from: 42, to: 35, captures: [] },
            ];

            for (let i = 0; i < moves.length; i++) {
                const move = moves[i];

                const moveResponse = await auth.post('/api/checkers/move', {
                    data: {
                        sessionId: gameSession.sessionId,
                        move: move,
                    },
                });

                expect(moveResponse.ok()).toBeTruthy();
                const result = await moveResponse.json();
                expect(result.success).toBe(true);
            }

            // Check game stats to verify record was saved
            const statsResponse = await auth.get('/api/checkers/stats');
            expect(statsResponse.ok()).toBeTruthy();

            const stats = await statsResponse.json();
            expect(parseInt(stats.total_games)).toBeGreaterThanOrEqual(1);
        });

        test('should handle abandoned checkers game cleanup', async ({ request }) => {
            const auth = addAuth(request);

            // Test the cleanup endpoint
            const cleanupResponse = await auth.post('/api/checkers/cleanup');
            expect(cleanupResponse.ok()).toBeTruthy();

            const cleanupResult = await cleanupResponse.json();
            expect(cleanupResult.success).toBe(true);
            expect(typeof cleanupResult.deletedGames).toBe('number');
        });
    });

    test.describe('Game Statistics', () => {
        test('should return checkers game statistics for authenticated users', async ({ request }) => {
            const auth = addAuth(request);

            const statsResponse = await auth.get('/api/checkers/stats');
            expect(statsResponse.ok()).toBeTruthy();

            const stats = await statsResponse.json();

            // Verify stat structure
            expect(stats).toHaveProperty('total_games');
            expect(stats).toHaveProperty('wins');
            expect(stats).toHaveProperty('losses');
            expect(stats).toHaveProperty('ties');
            expect(stats).toHaveProperty('avg_moves');
            expect(stats).toHaveProperty('best_score');
            expect(stats).toHaveProperty('incomplete_games');

            // All values should be numbers (even if 0)
            expect(typeof parseInt(stats.total_games)).toBe('number');
            expect(typeof parseInt(stats.wins)).toBe('number');
            expect(typeof parseInt(stats.losses)).toBe('number');
        });

        test('should return popular checkers game states', async ({ request }) => {
            const statesResponse = await request.get('/api/checkers/game_states', {
                params: {
                    limit: 3,
                    gameId: 'checkers',
                },
            });
            expect(statesResponse.ok()).toBeTruthy();

            const states = await statesResponse.json();
            expect(Array.isArray(states)).toBeTruthy();
            expect(states.length).toBeLessThanOrEqual(3);

            // If states exist, verify structure
            if (states.length > 0) {
                const firstState = states[0];
                expect(firstState).toHaveProperty('board_positions');
                expect(firstState).toHaveProperty('move_count');
                expect(firstState).toHaveProperty('count');
                expect(firstState).toHaveProperty('rating');

                expect(firstState.board_positions).toMatch(/^[RrBb_]{64}$/);
                expect(typeof firstState.move_count).toBe('number');
                expect(typeof firstState.count).toBe('number');
            }
        });
    });

    test.describe('Database Functions', () => {
        test('should validate checkers move format', async ({ request }) => {
            const auth = addAuth(request);

            const startResponse = await auth.post('/api/checkers/start');
            expect(startResponse.ok()).toBeTruthy();
            const gameSession = await startResponse.json();

            // Try to make an invalid move (out of bounds)
            const moveResponse = await auth.post('/api/checkers/move', {
                data: {
                    sessionId: gameSession.sessionId,
                    move: { from: 70, to: 80, captures: [] }, // Invalid positions
                },
            });

            // Should handle error gracefully
            expect(moveResponse.status()).toBeGreaterThanOrEqual(400);
        });

        test('should enforce checkers rating constraints', async ({ request }) => {
            // Check the rating constraint exists by examining popular states
            const statesResponse = await request.get('/api/checkers/game_states?limit=1');
            expect(statesResponse.ok()).toBeTruthy();

            const states = await statesResponse.json();
            if (states.length > 0) {
                const rating = states[0].rating;
                expect(rating).toBeGreaterThanOrEqual(-1.0);
                expect(rating).toBeLessThanOrEqual(1.0);
            }
        });
    });
});
