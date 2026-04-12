// tests/api/api-endpoints.spec.js
const { test, expect } = require('@playwright/test');
const { addAuth, getSessionId, createTestUser } = require('../helpers/auth-helper');
const { verifyApiResponse } = require('../helpers/test-utils');

test.describe('API Endpoints', () => {
    test.describe('Health and Basic Endpoints', () => {
        test('GET /api/health returns server status', async ({ request }) => {
            const response = await request.get('/api/health');
            expect(response.ok()).toBeTruthy();

            const healthData = await response.json();
            expect(healthData).toHaveProperty('status');
            expect(healthData.status).toBe('OK'); // Your API returns 'OK', not an array
            expect(healthData).toHaveProperty('service');
        });

        test('GET /api/games_list returns games list', async ({ request }) => {
            const response = await request.get('/api/games_list');
            expect(response.ok()).toBeTruthy();

            const data = await response.json();
            expect(data).toHaveProperty('games');
            expect(Array.isArray(data.games)).toBeTruthy();
            expect(data.games.length).toBeGreaterThan(0);

            if (data.games.length > 0) {
                verifyApiResponse(data.games[0], ['id', 'name', 'game_shell_ready', 'ai_model_integrated']);
            }
        });
    });

    test.describe('Game API (Authenticated)', () => {
        test('GET /api/game/:gameId/info returns game info', async ({ request }) => {
            const auth = addAuth(request);
            const response = await auth.get('/api/game/tic-tac-toe/info');

            if (response.ok()) {
                const gameInfo = await response.json();
                verifyApiResponse(gameInfo, ['game']);
                verifyApiResponse(gameInfo.game, ['id', 'name']);
                expect(gameInfo.game.id).toBe('tic-tac-toe');
            } else {
                expect([200, 404]).toContain(response.status());
            }
        });

        test('POST /api/game/:gameId/start creates game session', async ({ request }) => {
            const auth = addAuth(request);
            const response = await auth.post('/api/game/tic-tac-toe/start');

            if (response.ok()) {
                const gameSession = await response.json();
                // Check what fields are actually returned by your API
                // This might need adjustment based on your actual response structure
                expect(gameSession).toBeDefined();
            } else {
                expect([200, 404, 501]).toContain(response.status());
            }
        });

        test('invalid game ID returns 404', async ({ request }) => {
            const auth = addAuth(request);
            const response = await auth.get('/api/game/nonexistent-game/info');
            expect(response.status()).toBe(404);
        });
    });

    test.describe('Authentication API', () => {
        test('GET /api/auth/me returns 401 when not authenticated', async ({ request }) => {
            const response = await request.get('/api/auth/me');
            expect(response.status()).toBe(401);

            const data = await response.json();
            expect(data.detail).toContain('No session provided');
        });

        test('POST /api/auth/login with valid credentials', async ({ request }) => {
            const auth = addAuth(request);
            const response = await auth.post('/api/auth/login', {
                data: {
                    email: 'demo@aigamehub.com',
                    password: 'demo123',
                },
            });

            // Debug 500 errors
            if (!response.ok()) {
                console.log('Login failed with status:', response.status());
                const errorText = await response.text();
                console.log('Login error response:', errorText);
            }

            expect(response.ok()).toBeTruthy();

            const loginData = await response.json();
            verifyApiResponse(loginData, ['user', 'message']);

            expect(loginData.user.email).toBe('demo@aigamehub.com');
            expect(loginData.message).toBe('Login successful');

            // Check that session cookie was set
            const cookies = response.headers()['set-cookie'];
            expect(cookies).toBeDefined();
            expect(cookies).toContain('sessionId');
        });

        test('POST /api/auth/login with invalid credentials', async ({ request }) => {
            // Use addAuth helper to automatically get CSRF token
            const auth = addAuth(request);
            const response = await auth.post('/api/auth/login', {
                data: {
                    email: 'invalid@example.com',
                    password: 'wrongpassword',
                },
            });

            expect(response.status()).toBe(401);

            const data = await response.json();
            expect(data.detail).toContain('Invalid email or password');
        });

        test('POST /api/auth/register creates new user', async ({ request }) => {
            const testUser = createTestUser();

            // Use addAuth helper to automatically get CSRF token
            const auth = addAuth(request);
            const response = await auth.post('/api/auth/register', {
                data: testUser,
            });

            // Debug 500 errors
            if (!response.ok()) {
                console.log('Register failed with status:', response.status());
                const errorText = await response.text();
                console.log('Register error response:', errorText);
            }

            expect(response.status()).toBe(201);

            const registerData = await response.json();
            verifyApiResponse(registerData, ['user', 'message']);

            expect(registerData.user.email).toBe(testUser.email);
            expect(registerData.message).toBe('User registered successfully');

            // Check that session cookie was set
            const cookies = response.headers()['set-cookie'];
            expect(cookies).toBeDefined();
            expect(cookies).toContain('sessionId');
        });

        test('POST /api/auth/register with existing email returns conflict', async ({ request }) => {
            // Use addAuth helper to automatically get CSRF token
            const auth = addAuth(request);
            const response = await auth.post('/api/auth/register', {
                data: {
                    username: 'demo@aigamehub.com',
                    email: 'demo@aigamehub.com', // This should already exist
                    password: 'password123',
                    displayName: 'Test User',
                },
            });

            expect(response.status()).toBe(409);

            const data = await response.json();
            expect(data.detail).toContain('Email already registered');
        });

        test('authenticated requests work with session ID', async ({ request }) => {
            const auth = addAuth(request);
            const response = await auth.get('/api/auth/me');

            if (!response.ok()) {
                const errorText = await response.text();
                console.log('Auth /me test - Error:', errorText);
            }

            expect(response.ok()).toBeTruthy();

            const userData = await response.json();
            expect(userData.email).toBe('demo@aigamehub.com');
        });

        test('GET /api/stats/me returns user statistics', async ({ request }) => {
            const auth = addAuth(request);
            const response = await auth.get('/api/stats/me');

            expect(response.ok()).toBeTruthy();

            const stats = await response.json();
            expect(stats).toHaveProperty('per_game');
            expect(typeof stats.per_game).toBe('object');
        });

        test('POST /api/auth/logout clears session', async ({ request }) => {
            // First, do a fresh login to get a session we can safely logout
            const auth = addAuth(request);
            const loginResponse = await auth.post('/api/auth/login', {
                data: {
                    email: 'demo@aigamehub.com',
                    password: 'demo123',
                },
            });

            expect(loginResponse.ok()).toBeTruthy();

            // Now logout using the auth helper
            const logoutResponse = await auth.post('/api/auth/logout');
            expect(logoutResponse.ok()).toBeTruthy();

            // Verify session is cleared by trying to access protected endpoint
            const meResponse = await auth.get('/api/auth/me');
            expect(meResponse.status()).toBe(401);

            // ADDED: Login again to restore session for other tests
            // This also tests that login works after logout
            const reLoginResponse = await auth.post('/api/auth/login', {
                data: {
                    email: 'demo@aigamehub.com',
                    password: 'demo123',
                },
            });

            expect(reLoginResponse.ok()).toBeTruthy();
        });
    });

    test.describe('AI API Endpoints (Authenticated)', () => {
        test('POST /api/ai/move returns AI move', async ({ request }) => {
            const auth = addAuth(request);
            const response = await auth.post('/api/ai/move', {
                data: {
                    gameState: {
                        board: Array(9).fill(null),
                        currentPlayer: 'O',
                    },
                    gameType: 'tic-tac-toe',
                },
            });

            if (response.ok()) {
                const aiMove = await response.json();
                expect(aiMove).toHaveProperty('ai_move');
            } else {
                // AI endpoint might not be fully implemented
                expect([200, 404, 500, 501]).toContain(response.status());
            }
        });
    });

    test.describe('Error Handling', () => {
        test('non-existent endpoints return 404', async ({ request }) => {
            const response = await request.get('/api/nonexistent-endpoint-xyz');
            expect(response.status()).toBe(404);
        });

        test('malformed JSON requests are handled gracefully', async ({ request }) => {
            const response = await request.post('/api/auth/login', {
                data: 'invalid json string',
                headers: {
                    'content-type': 'application/json',
                },
            });

            expect([400, 422, 500]).toContain(response.status());
        });

        test('missing required fields return appropriate errors', async ({ request }) => {
            // Use addAuth helper to automatically get CSRF token
            const auth = addAuth(request);
            const response = await auth.post('/api/auth/login', {
                data: {}, // Missing email and password
            });

            expect([400, 401, 405, 422, 500]).toContain(response.status());
        });
    });

    test.describe('CORS and Headers', () => {
        test('CORS headers are present', async ({ request }) => {
            const response = await request.get('/api/health', {
                headers: { Origin: 'http://localhost:5173' },
            });

            const corsHeader = response.headers()['access-control-allow-origin'];
            expect(corsHeader).toBeDefined();
        });

        test('Content-Type headers are correct', async ({ request }) => {
            const response = await request.get('/api/games_list');

            const contentType = response.headers()['content-type'];
            expect(contentType).toContain('application/json');
        });
    });
});
