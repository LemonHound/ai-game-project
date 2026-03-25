import type { Game } from '../types';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(path, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...options?.headers },
        ...options,
    });
    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Request failed' }));
        throw new Error(error.detail ?? 'Request failed');
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
