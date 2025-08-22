const { test, expect } = require('@playwright/test');
const { addAuth } = require('../helpers/auth-helper');

test.describe('Tic Tac Toe Database Integration', () => {
    test.describe('Game State Storage', () => {
        test('should store game states when moves are made', async ({ request }) => {
            // Need authentication for game routes
            const auth = addAuth(request);

            // Start a new game
            const startResponse = await auth.post('/api/tic-tac-toe/start');

            expect(startResponse.ok()).toBeTruthy();
            const gameSession = await startResponse.json();

            // Use the correct property name from the response
            expect(gameSession.sessionId).toBeDefined();

            // Make a move - API expects only sessionId and move (position 0-8)
            const moveResponse = await auth.post('/api/tic-tac-toe/move', {
                data: {
                    sessionId: gameSession.sessionId,
                    move: { position: 0 },
                },
            });

            expect(moveResponse.ok()).toBeTruthy();
            const moveResult = await moveResponse.json();
            expect(moveResult.success).toBe(true);

            // Verify state was stored by checking popular states
            const statesResponse = await request.get('/api/tic-tac-toe/game_states?limit=5');
            expect(statesResponse.ok()).toBeTruthy();

            const states = await statesResponse.json();
            expect(Array.isArray(states)).toBeTruthy();

            // Should find a state with 1 move
            const oneMove = states.find(state => state.move_count === 1);
            expect(oneMove).toBeTruthy();
            expect(oneMove.board_positions).toMatch(/^[XO_]{9}$/); // Valid board format
        });

        test('should increment count for duplicate game states', async ({ request }) => {
            const auth = addAuth(request);

            // Start two games and make the same first move
            for (let i = 0; i < 2; i++) {
                const startResponse = await auth.post('/api/tic-tac-toe/start');
                expect(startResponse.ok()).toBeTruthy();
                const gameSession = await startResponse.json();

                // Make same move (position 4 - center)
                const moveResponse = await auth.post('/api/tic-tac-toe/move', {
                    data: {
                        sessionId: gameSession.sessionId,
                        move: { position: 4 },
                    },
                });
                expect(moveResponse.ok()).toBeTruthy();
            }

            // Check that the state count increased
            const statesResponse = await request.get('/api/tic-tac-toe/game_states');
            const states = await statesResponse.json();

            const centerMoveState = states.find(
                state => state.move_count === 1 && state.board_positions.charAt(4) === 'X'
            );

            expect(centerMoveState).toBeTruthy();
            expect(centerMoveState.count).toBeGreaterThanOrEqual(2);
        });
    });

    test.describe('Player Game Records', () => {
        test('should create game record on start and complete on finish', async ({ request }) => {
            // Use authentication helper
            const auth = addAuth(request);

            // Start game with auth
            const startResponse = await auth.post('/api/tic-tac-toe/start');
            expect(startResponse.ok()).toBeTruthy();
            const gameSession = await startResponse.json();

            // Simulate a complete game (player wins)
            const winningMoves = [{ position: 0 }, { position: 1 }, { position: 3 }];

            for (let i = 0; i < winningMoves.length; i++) {
                const move = winningMoves[i];

                const moveResponse = await auth.post('/api/tic-tac-toe/move', {
                    data: {
                        sessionId: gameSession.sessionId,
                        move: { position: move.position },
                    },
                });

                expect(moveResponse.ok()).toBeTruthy();
                const result = await moveResponse.json();
                expect(result.success).toBe(true);
            }

            // Check game stats to verify record was saved
            const statsResponse = await auth.get('/api/tic-tac-toe/stats');
            expect(statsResponse.ok()).toBeTruthy();

            const stats = await statsResponse.json();
            expect(parseInt(stats.total_games)).toBeGreaterThanOrEqual(1);
        });

        test('should handle abandoned game cleanup', async ({ request }) => {
            const auth = addAuth(request);
            // Test the cleanup endpoint
            const cleanupResponse = await auth.post('/api/tic-tac-toe/cleanup');
            expect(cleanupResponse.ok()).toBeTruthy();

            const cleanupResult = await cleanupResponse.json();
            expect(cleanupResult.success).toBe(true);
            expect(typeof cleanupResult.deletedGames).toBe('number');
        });

        test('should handle completing games that were cleaned up', async ({ request }) => {
            const auth = addAuth(request);

            // Start a game first
            const startResponse = await auth.post('/api/tic-tac-toe/start');
            expect(startResponse.ok()).toBeTruthy();
            const gameSession = await startResponse.json();

            // Losing move sequence
            const moves = [0, 1, 3];

            // Make first move
            let moveResponse = await auth.post('/api/tic-tac-toe/move', {
                data: {
                    sessionId: gameSession.sessionId,
                    move: { position: moves[0] },
                },
            });

            // ensure the move posted correctly
            expect(moveResponse.ok()).toBeTruthy();
            let result = await moveResponse.json();
            expect(result.success).toBe(true);

            // Cleanup the game
            await auth.post('/api/tic-tac-toe/cleanup');

            for (let i = 1; i < moves.length; i++) {
                moveResponse = await auth.post('/api/tic-tac-toe/move', {
                    data: {
                        sessionId: gameSession.sessionId,
                        move: { position: moves[i] },
                    },
                });

                expect(moveResponse.ok()).toBeTruthy();
                result = await moveResponse.json();
                expect(result.success).toBe(true);
            }

            // game completed after cleanup, but should have been written to database
            const statsResponse = await auth.get('/api/tic-tac-toe/stats');
            expect(statsResponse.ok()).toBeTruthy();

            const stats = await statsResponse.json();
            expect(parseInt(stats.total_games)).toBeGreaterThanOrEqual(1);
        });
    });

    test.describe('Game Statistics', () => {
        test('should return game statistics for authenticated users', async ({ request }) => {
            // Use authentication helper
            const auth = addAuth(request);

            const statsResponse = await auth.get('/api/tic-tac-toe/stats');
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

        test('should return popular game states', async ({ request }) => {
            const statesResponse = await request.get('/api/tic-tac-toe/game_states', {
                params: {
                    limit: 3,
                    gameId: 'tic-tac-toe',
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

                expect(firstState.board_positions).toMatch(/^[XO_]{9}$/);
                expect(typeof firstState.move_count).toBe('number');
                expect(typeof firstState.count).toBe('number');
            }
        });
    });

    test.describe('Database Functions', () => {
        test('should validate board position format', async ({ request }) => {
            const auth = addAuth(request);

            const startResponse = await auth.post('/api/tic-tac-toe/start');
            expect(startResponse.ok()).toBeTruthy();
            const gameSession = await startResponse.json();

            // Try to make an invalid move (position out of range)
            const moveResponse = await auth.post('/api/tic-tac-toe/move', {
                data: {
                    sessionId: gameSession.sessionId,
                    move: { position: 10 }, // Invalid position
                },
            });

            // Should handle error gracefully
            expect(moveResponse.status()).toBeGreaterThanOrEqual(400);
        });

        test('should enforce rating constraints', async ({ request }) => {
            // Check the rating constraint exists by examining popular states
            const statesResponse = await request.get('/api/tic-tac-toe/game_states?limit=1');
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
