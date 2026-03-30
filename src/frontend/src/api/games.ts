import type { Game } from '../types';

/**
 * Error thrown by game API requests when the server returns a non-OK response.
 * Carries the HTTP status code and an optional board_state payload from the error body.
 */
export class GameApiError extends Error {
    status: number;
    boardState: unknown | null;

    /**
     * @param detail - Human-readable error message.
     * @param status - HTTP status code from the server response.
     * @param boardState - Optional board state from the error body, if present.
     */
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

/**
 * Fetch the list of available games, optionally filtered by category.
 *
 * @param category - Optional category filter (e.g. "active", "strategy").
 * @returns Array of Game metadata objects.
 * @throws {GameApiError} If the request fails.
 */
export async function fetchGames(category?: string): Promise<Game[]> {
    const params = category ? `?category=${encodeURIComponent(category)}` : '';
    const data = await request<{ games: Game[] }>(`/api/games_list${params}`);
    return data.games;
}

/**
 * Forfeit the current game session, marking it as abandoned on the server.
 *
 * @param gameId - The game type identifier (e.g. "chess", "tic-tac-toe").
 * @param sessionId - The active game session UUID.
 */
export async function forfeitGame(gameId: string, sessionId: string): Promise<void> {
    await fetch(`/api/game/${gameId}/end`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameSessionId: sessionId, move: null }),
    });
}
