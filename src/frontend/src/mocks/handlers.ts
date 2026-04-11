import { http, HttpResponse } from 'msw';

export const handlers = [
    http.get('/api/auth/me', () => {
        return HttpResponse.json({
            id: 1,
            username: 'testuser',
            email: 'test@example.com',
            displayName: 'Test User',
            authProvider: 'local',
            emailVerified: true,
            statsPublic: true,
        });
    }),

    http.post('/api/auth/login', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        if (body.email === 'fail@example.com') {
            return HttpResponse.json({ detail: 'Invalid credentials' }, { status: 401 });
        }
        return HttpResponse.json({
            user: {
                id: 1,
                username: 'testuser',
                email: body.email,
                displayName: 'Test User',
                authProvider: 'local',
                emailVerified: true,
                statsPublic: true,
            },
        });
    }),

    http.post('/api/auth/register', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
            user: {
                id: 2,
                username: body.username,
                email: body.email,
                displayName: body.displayName || body.username,
                authProvider: 'local',
                emailVerified: false,
                statsPublic: true,
            },
        });
    }),

    http.post('/api/auth/logout', () => {
        return HttpResponse.json({ message: 'Logged out' });
    }),

    http.get('/api/stats/me', () => {
        return HttpResponse.json({
            per_game: {
                tic_tac_toe: {
                    games_played: 10,
                    wins: 6,
                    losses: 3,
                    draws: 1,
                    games_abandoned: 0,
                    win_rate: 0.6,
                    best_streak: 4,
                    current_streak: 2,
                    avg_duration_seconds: 45,
                },
                chess: {
                    games_played: 0,
                    wins: 0,
                    losses: 0,
                    draws: 0,
                    games_abandoned: 0,
                    win_rate: 0,
                    best_streak: 0,
                    current_streak: 0,
                    avg_duration_seconds: 0,
                },
            },
        });
    }),

    http.get('/api/leaderboard/:boardType', ({ request }) => {
        const url = new URL(request.url);
        const page = parseInt(url.searchParams.get('page') || '1');
        return HttpResponse.json({
            board_type: 'games_played',
            game_type: 'tic_tac_toe',
            entries: [
                { rank: 1, user_id: 1, display_name: 'Alice', value: 50 },
                { rank: 2, user_id: 2, display_name: 'Bob', value: 40 },
                { rank: 3, user_id: 3, display_name: 'Charlie', value: 30 },
            ],
            page,
            per_page: 10,
            total_entries: 3,
        });
    }),

    http.get('/api/about/stats', () => {
        return HttpResponse.json({
            games_played: 1234,
            moves_analyzed: 56789,
            unique_players: 42,
            ai_win_rate: 65.5,
            training_moves: 100000,
            days_running: 30,
        });
    }),

    http.get('/api/games_list', () => {
        return HttpResponse.json({
            games: [
                {
                    id: 'tic-tac-toe',
                    name: 'Tic-Tac-Toe',
                    description: 'Classic 3x3 game',
                    icon: 'grid',
                    difficulty: 'Easy',
                    players: 2,
                    status: 'active',
                    category: 'strategy',
                    tags: ['classic'],
                    game_shell_ready: true,
                    ai_model_integrated: true,
                },
                {
                    id: 'chess',
                    name: 'Chess',
                    description: 'The king of strategy games',
                    icon: 'crown',
                    difficulty: 'Hard',
                    players: 2,
                    status: 'active',
                    category: 'strategy',
                    tags: ['classic'],
                    game_shell_ready: true,
                    ai_model_integrated: false,
                },
            ],
        });
    }),
];
