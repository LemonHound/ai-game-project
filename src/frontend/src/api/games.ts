import type { Game } from '../types';

export class GameApiError extends Error {
    status: number;
    boardState: unknown | null;

    constructor(detail: string, status: number, boardState: unknown | null = null) {
        super(detail);
        this.name = 'GameApiError';
        this.status = status;
        this.boardState = boardState;
    }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(path, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...options?.headers },
        ...options,
    });
    if (!response.ok) {
        const body = await response.json().catch(() => ({ detail: 'Request failed' }));
        throw new GameApiError(body.detail ?? 'Request failed', response.status, body.board_state ?? null);
    }
    return response.json() as Promise<T>;
}

export async function fetchGames(category?: string): Promise<Game[]> {
    const params = category ? `?category=${encodeURIComponent(category)}` : '';
    const data = await request<{ games: Game[] }>(`/api/games_list${params}`);
    return data.games;
}

export async function startGame(
    gameId: string,
    userId: number | null,
    difficulty: string,
    playerStarts = true
): Promise<unknown> {
    return request(`/api/game/${gameId}/start`, {
        method: 'POST',
        body: JSON.stringify({ userId, difficulty, playerStarts }),
    });
}

export async function makeMove(
    gameId: string,
    gameSessionId: string,
    move: unknown,
    userId: number | null
): Promise<unknown> {
    return request(`/api/game/${gameId}/move`, {
        method: 'POST',
        body: JSON.stringify({ gameSessionId, move, userId }),
    });
}

export async function getGameSession(gameId: string, sessionId: string): Promise<unknown> {
    return request(`/api/game/${gameId}/session/${sessionId}`);
}

export async function forfeitGame(gameId: string, sessionId: string): Promise<void> {
    await fetch(`/api/game/${gameId}/end`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameSessionId: sessionId, move: null }),
    });
}
