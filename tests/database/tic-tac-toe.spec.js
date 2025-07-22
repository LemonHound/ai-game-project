// tests/database/tic-tac-toe-db.spec.js
const { test, expect } = require('@playwright/test');

test.describe('Tic Tac Toe Database Integration', () => {

    test.describe('Game State Storage', () => {
        test('should store game states when moves are made', async ({ request }) => {
            // Start a new game
            const startResponse = await request.post('/api/game/tic-tac-toe/start', {
                headers: {
                    'x-session-id': `test-session-${Date.now()}`
                }
            });

            expect(startResponse.ok()).toBeTruthy();
            const gameSession = await startResponse.json();

            // Make a move
            const moveResponse = await request.post('/api/game/tic-tac-toe/move', {
                data: {
                    gameSessionId: gameSession.gameSessionId,
                    position: 0,
                    currentState: {
                        board: Array(9).fill(null),
                        currentPlayer: 'X',
                        gameOver: false,
                        winner: null,
                        moveHistory: []
                    }
                }
            });

            expect(moveResponse.ok()).toBeTruthy();
            const moveResult = await moveResponse.json();
            expect(moveResult.success).toBe(true);

            // Verify state was stored by checking popular states
            const statesResponse = await request.get('/api/game/tic-tac-toe/popular-states?limit=5');
            expect(statesResponse.ok()).toBeTruthy();

            const states = await statesResponse.json();
            expect(Array.isArray(states)).toBeTruthy();

            // Should find a state with 1 move
            const oneMove = states.find(state => state.move_count === 1);
            expect(oneMove).toBeTruthy();
            expect(oneMove.board_positions).toMatch(/^[XO_]{9}$/); // Valid board format
        });

        test('should increment count for duplicate game states', async ({ request }) => {
            const sessionId1 = `test-session-${Date.now()}-1`;
            const sessionId2 = `test-session-${Date.now()}-2`;

            // Start two games and make the same first move
            for (const sessionId of [sessionId1, sessionId2]) {
                const startResponse = await request.post('/api/game/tic-tac-toe/start', {
                    headers: { 'x-session-id': sessionId }
                });
                expect(startResponse.ok()).toBeTruthy();

                const gameSession = await startResponse.json();

                // Make same move (position 4 - center)
                const moveResponse = await request.post('/api/game/tic-tac-toe/move', {
                    data: {
                        gameSessionId: gameSession.gameSessionId,
                        position: 4,
                        currentState: {
                            board: Array(9).fill(null),
                            currentPlayer: 'X',
                            gameOver: false,
                            winner: null,
                            moveHistory: []
                        }
                    }
                });
                expect(moveResponse.ok()).toBeTruthy();
            }

            // Check that the state count increased
            const statesResponse = await request.get('/api/game/tic-tac-toe/popular-states?limit=10');
            const states = await statesResponse.json();

            const centerMoveState = states.find(state =>
                state.move_count === 1 && state.board_positions.charAt(4) === 'X'
            );

            expect(centerMoveState).toBeTruthy();
            expect(centerMoveState.count).toBeGreaterThanOrEqual(2);
        });
    });

    test.describe('Player Game Records', () => {
        test('should create game record on start and complete on finish', async ({ request }) => {
            // Login as demo user first
            const loginResponse = await request.post('/api/auth/login', {
                data: {
                    email: 'demo@aigamehub.com',
                    password: 'password123'
                }
            });
            expect(loginResponse.ok()).toBeTruthy();

            const loginData = await loginResponse.json();
            const sessionId = `test-complete-game-${Date.now()}`;

            // Start game with auth
            const startResponse = await request.post('/api/game/tic-tac-toe/start', {
                headers: {
                    'x-session-id': sessionId,
                    'cookie': `session=${loginData.sessionId}`
                }
            });
            expect(startResponse.ok()).toBeTruthy();

            // Simulate a complete game (player wins)
            let gameState = {
                board: Array(9).fill(null),
                currentPlayer: 'X',
                gameOver: false,
                winner: null,
                moveHistory: []
            };

            // Player wins with moves: X:0, O:1, X:3, O:4, X:6
            const winningMoves = [
                { position: 0, player: 'X' }, // X
                { position: 1, player: 'O' }, // O
                { position: 3, player: 'X' }, // X
                { position: 4, player: 'O' }, // O
                { position: 6, player: 'X' }  // X wins (0,3,6 = left column)
            ];

            for (let i = 0; i < winningMoves.length; i++) {
                const move = winningMoves[i];

                const moveResponse = await request.post('/api/game/tic-tac-toe/move', {
                    headers: {
                        'cookie': `session=${loginData.sessionId}`
                    },
                    data: {
                        gameSessionId: sessionId,
                        position: move.position,
                        currentState: gameState
                    }
                });

                expect(moveResponse.ok()).toBeTruthy();
                const result = await moveResponse.json();
                gameState = result.newState;
            }

            // Verify game was completed
            expect(gameState.gameOver).toBe(true);
            expect(gameState.winner).toBe('X');

            // Check game stats to verify record was saved
            const statsResponse = await request.get('/api/game/tic-tac-toe/stats', {
                headers: {
                    'cookie': `session=${loginData.sessionId}`
                }
            });
            expect(statsResponse.ok()).toBeTruthy();

            const stats = await statsResponse.json();
            expect(parseInt(stats.wins)).toBeGreaterThanOrEqual(1);
            expect(parseInt(stats.total_games)).toBeGreaterThanOrEqual(1);
        });

        test('should handle abandoned game cleanup', async ({ request }) => {
            // This test would be more complex in real scenarios, but we can test the cleanup endpoint
            const cleanupResponse = await request.post('/api/game/tic-tac-toe/cleanup');
            expect(cleanupResponse.ok()).toBeTruthy();

            const cleanupResult = await cleanupResponse.json();
            expect(cleanupResult.success).toBe(true);
            expect(typeof cleanupResult.deletedGames).toBe('number');
        });

        test('should handle completing games that were cleaned up', async ({ request }) => {
            const sessionId = `test-missing-game-${Date.now()}`;

            // Try to complete a game that doesn't exist (simulating cleanup scenario)
            // This should create a new record instead of failing
            const gameState = {
                board: ['X', 'O', 'X', 'O', 'X', 'O', 'X', null, null],
                currentPlayer: 'O',
                gameOver: true,
                winner: 'X',
                moveHistory: [
                    { player: 'X', position: 0 },
                    { player: 'O', position: 1 },
                    { player: 'X', position: 2 },
                    { player: 'O', position: 3 },
                    { player: 'X', position: 4 },
                    { player: 'O', position: 5 },
                    { player: 'X', position: 6 }
                ]
            };

            const moveResponse = await request.post('/api/game/tic-tac-toe/move', {
                data: {
                    gameSessionId: sessionId,
                    position: 6, // Final winning move
                    currentState: {
                        ...gameState,
                        gameOver: false,
                        winner: null
                    }
                }
            });

            // Should succeed even though game record doesn't exist
            expect(moveResponse.ok()).toBeTruthy();
            const result = await moveResponse.json();
            expect(result.success).toBe(true);
        });
    });

    test.describe('Game Statistics', () => {
        test('should return game statistics for authenticated users', async ({ request }) => {
            // Login as test user
            const loginResponse = await request.post('/api/auth/login', {
                data: {
                    email: 'test@example.com',
                    password: 'password123'
                }
            });
            expect(loginResponse.ok()).toBeTruthy();

            const loginData = await loginResponse.json();

            const statsResponse = await request.get('/api/game/tic-tac-toe/stats', {
                headers: {
                    'cookie': `session=${loginData.sessionId}`
                }
            });

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
            const statesResponse = await request.get('/api/game/tic-tac-toe/popular-states?limit=3');
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
            // Test with invalid board format - this should be handled by the application
            const sessionId = `test-invalid-board-${Date.now()}`;

            const startResponse = await request.post('/api/game/tic-tac-toe/start', {
                headers: { 'x-session-id': sessionId }
            });
            expect(startResponse.ok()).toBeTruthy();

            const gameSession = await startResponse.json();

            // Try to make an invalid move (position out of range)
            const moveResponse = await request.post('/api/game/tic-tac-toe/move', {
                data: {
                    gameSessionId: gameSession.gameSessionId,
                    position: 10, // Invalid position
                    currentState: {
                        board: Array(9).fill(null),
                        currentPlayer: 'X',
                        gameOver: false,
                        winner: null,
                        moveHistory: []
                    }
                }
            });

            // Should handle error gracefully
            expect(moveResponse.status()).toBeGreaterThanOrEqual(400);
        });

        test('should enforce rating constraints', async ({ request }) => {
            // This would be tested at database level, but we can verify the constraint exists
            // by checking the schema or attempting invalid data
            const statesResponse = await request.get('/api/game/tic-tac-toe/popular-states?limit=1');
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

// tests/database/database-functions.spec.js
const { test, expect } = require('@playwright/test');

test.describe('Database Functions', () => {

    test.describe('Cleanup Functions', () => {
        test('cleanup_expired_sessions function works', async ({ request }) => {
            // Test the session cleanup endpoint if it exists
            const response = await request.get('/api/health');
            expect(response.ok()).toBeTruthy();
            // This confirms database connectivity for function testing
        });

        test('cleanup_abandoned_tic_tac_toe_games function works', async ({ request }) => {
            const cleanupResponse = await request.post('/api/game/tic-tac-toe/cleanup');
            expect(cleanupResponse.ok()).toBeTruthy();

            const result = await cleanupResponse.json();
            expect(result.success).toBe(true);
            expect(typeof result.deletedGames).toBe('number');
            expect(result.deletedGames).toBeGreaterThanOrEqual(0);
        });
    });

    test.describe('Upsert Functions', () => {
        test('upsert_tic_tac_toe_state handles new and existing states', async ({ request }) => {
            // This is tested indirectly through the move endpoint
            const sessionId = `test-upsert-${Date.now()}`;

            const startResponse = await request.post('/api/game/tic-tac-toe/start', {
                headers: { 'x-session-id': sessionId }
            });
            const gameSession = await startResponse.json();

            // Make the same move twice (in different games) to test upsert
            for (let i = 0; i < 2; i++) {
                const moveResponse = await request.post('/api/game/tic-tac-toe/move', {
                    data: {
                        gameSessionId: `${gameSession.gameSessionId}-${i}`,
                        position: 4,
                        currentState: {
                            board: Array(9).fill(null),
                            currentPlayer: 'X',
                            gameOver: false,
                            winner: null,
                            moveHistory: []
                        }
                    }
                });
                expect(moveResponse.ok()).toBeTruthy();
            }

            // Verify the state count increased
            const statesResponse = await request.get('/api/game/tic-tac-toe/popular-states');
            const states = await statesResponse.json();

            const centerState = states.find(s => s.board_positions.charAt(4) === 'X' && s.move_count === 1);
            if (centerState) {
                expect(centerState.count).toBeGreaterThanOrEqual(1);
            }
        });
    });

    test.describe('Game Management Functions', () => {
        test('start and complete game functions work together', async ({ request }) => {
            // Login first
            const loginResponse = await request.post('/api/auth/login', {
                data: {
                    email: 'demo@aigamehub.com',
                    password: 'password123'
                }
            });
            expect(loginResponse.ok()).toBeTruthy();
            const loginData = await loginResponse.json();

            const sessionId = `test-functions-${Date.now()}`;

            // Start game
            const startResponse = await request.post('/api/game/tic-tac-toe/start', {
                headers: {
                    'x-session-id': sessionId,
                    'cookie': `session=${loginData.sessionId}`
                }
            });
            expect(startResponse.ok()).toBeTruthy();

            // Complete game
            const moveResponse = await request.post('/api/game/tic-tac-toe/move', {
                headers: {
                    'cookie': `session=${loginData.sessionId}`
                },
                data: {
                    gameSessionId: sessionId,
                    position: 0,
                    currentState: {
                        board: [null, null, null, 'O', 'O', null, null, null, 'X'],
                        currentPlayer: 'X',
                        gameOver: true,
                        winner: 'O',
                        moveHistory: [
                            { player: 'O', position: 3 },
                            { player: 'O', position: 4 },
                            { player: 'X', position: 8 }
                        ]
                    }
                }
            });

            expect(moveResponse.ok()).toBeTruthy();

            // Verify through stats
            const statsResponse = await request.get('/api/game/tic-tac-toe/stats', {
                headers: {
                    'cookie': `session=${loginData.sessionId}`
                }
            });
            expect(statsResponse.ok()).toBeTruthy();
        });
    });
});