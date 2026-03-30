import { GameApiError } from './games';

export interface TttGameState {
    board: (string | null)[];
    current_turn: 'player' | 'ai';
    player_starts: boolean;
    player_symbol: string;
    ai_symbol: string;
    status: 'in_progress' | 'complete';
    winner: string | null;
    winning_positions: number[] | null;
}

export interface TttResumeResponse {
    id: string | null;
    state: TttGameState | null;
}

export interface TttNewGameResponse {
    id: string;
    state: TttGameState;
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

export async function tttResume(): Promise<TttResumeResponse> {
    return request<TttResumeResponse>('/api/game/tic-tac-toe/resume');
}

export async function tttNewGame(playerStarts: boolean): Promise<TttNewGameResponse> {
    return request<TttNewGameResponse>('/api/game/tic-tac-toe/newgame', {
        method: 'POST',
        body: JSON.stringify({ player_starts: playerStarts }),
    });
}

export async function tttMove(position: number): Promise<void> {
    const response = await fetch('/api/game/tic-tac-toe/move', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position }),
    });
    if (!response.ok) {
        const body = await response.json().catch(() => ({ detail: 'Move failed' }));
        throw new GameApiError(body.detail ?? 'Move failed', response.status, null);
    }
}

export function tttSubscribeSSE(
    sessionId: string,
    handlers: {
        onStatus: (message: string) => void;
        onMove: (data: Partial<TttGameState> & { position: number | null }) => void;
        onError: (code: string, message: string) => void;
        onHeartbeat?: () => void;
    }
): EventSource {
    const es = new EventSource(`/api/game/tic-tac-toe/events/${sessionId}`, {
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
            handlers.onMove(parsed.data as Partial<TttGameState> & { position: number | null });
        } else if (parsed.type === 'error') {
            handlers.onError(parsed.code ?? 'unknown', parsed.message ?? 'Unknown error');
        } else if (parsed.type === 'heartbeat') {
            handlers.onHeartbeat?.();
        }
    };

    return es;
}
