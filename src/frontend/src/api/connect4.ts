import { GameApiError } from './games';

export interface C4GameState {
    board: ('player' | 'ai' | null)[][];
    current_turn: 'player' | 'ai' | null;
    game_active: boolean;
    player_starts: boolean;
    move_count: number;
    last_move: { row: number; col: number; player: string } | null;
}

export interface C4MoveData extends Partial<C4GameState> {
    col: number | null;
    row: number | null;
    player: 'player' | 'ai' | null;
    status: 'in_progress' | 'complete';
    winner: 'player' | 'ai' | 'draw' | null;
    winning_cells: [number, number][] | null;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(path, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...options?.headers },
        ...options,
    });
    if (!response.ok) {
        const body = await response.json().catch(() => ({ detail: 'Request failed' }));
        throw new GameApiError(body.detail ?? 'Request failed', response.status, null);
    }
    return response.json() as Promise<T>;
}

/**
 * Check for an existing in-progress Connect 4 session for the current user.
 *
 * @returns Object with session id and state, or null values if no active session.
 * @throws {GameApiError} If the request fails.
 */
export async function c4Resume(): Promise<{ id: string | null; state: C4GameState | null }> {
    return request<{ id: string | null; state: C4GameState | null }>('/api/game/connect4/resume');
}

/**
 * Start a new Connect 4 game, closing any prior active session.
 *
 * @param playerStarts - If true, player drops first.
 * @returns New game session id and initial board state.
 * @throws {GameApiError} If the request fails.
 */
export async function c4NewGame(playerStarts: boolean): Promise<{ id: string; state: C4GameState }> {
    return request<{ id: string; state: C4GameState }>('/api/game/connect4/newgame', {
        method: 'POST',
        body: JSON.stringify({ player_starts: playerStarts }),
    });
}

/**
 * Submit a Connect 4 column drop; the AI response arrives via the SSE stream.
 *
 * @param col - Column index to drop into (0–6).
 * @throws {GameApiError} If the column is full or the request fails.
 */
export async function c4Move(col: number): Promise<void> {
    const response = await fetch('/api/game/connect4/move', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ col }),
    });
    if (!response.ok) {
        const body = await response.json().catch(() => ({ detail: 'Move failed' }));
        throw new GameApiError(body.detail ?? 'Move failed', response.status, null);
    }
}

/**
 * Open an SSE connection for a Connect 4 game session and wire up event handlers.
 *
 * @param sessionId - Active game session UUID.
 * @param handlers - Callbacks for status, move, error, and heartbeat events.
 * @returns The EventSource instance; caller is responsible for closing it.
 */
export function c4SubscribeSSE(
    sessionId: string,
    handlers: {
        onStatus: (message: string) => void;
        onMove: (data: C4MoveData) => void;
        onError: (code: string, message: string) => void;
        onHeartbeat?: () => void;
    }
): EventSource {
    const es = new EventSource(`/api/game/connect4/events/${sessionId}`, {
        withCredentials: true,
    });

    es.onmessage = event => {
        let parsed: { type: string; message?: string; data?: unknown; code?: string } | null = null;
        try {
            parsed = JSON.parse(event.data);
        } catch {
            return;
        }
        if (!parsed) return;

        if (parsed.type === 'status' && parsed.message) {
            handlers.onStatus(parsed.message);
        } else if (parsed.type === 'move' && parsed.data) {
            handlers.onMove(parsed.data as C4MoveData);
        } else if (parsed.type === 'error') {
            handlers.onError(parsed.code ?? 'unknown', parsed.message ?? 'Unknown error');
        } else if (parsed.type === 'heartbeat') {
            handlers.onHeartbeat?.();
        }
    };

    return es;
}
