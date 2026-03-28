import { GameApiError } from './games';

export interface CheckersGameState {
    board: string[];
    current_turn: 'player' | 'ai' | null;
    game_active: boolean;
    player_starts: boolean;
    player_symbol: string;
    ai_symbol: string;
    must_capture: number | null;
    last_move: { from: number; to: number; captured: number[]; is_king_promotion: boolean } | null;
    legal_pieces: number[];
}

export interface CheckersMoveData extends Partial<CheckersGameState> {
    from: number | null;
    to: number | null;
    captured: number[];
    player: 'player' | 'ai';
    is_king_promotion: boolean;
    status: 'in_progress' | 'complete';
    winner: 'player' | 'ai' | null;
}

export interface CheckersResumeResponse {
    session_id: string | null;
    state: CheckersGameState | null;
}

export interface CheckersNewGameResponse {
    session_id: string;
    state: CheckersGameState;
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

export async function checkersResume(): Promise<CheckersResumeResponse> {
    return request<CheckersResumeResponse>('/api/game/checkers/resume');
}

export async function checkersNewGame(playerStarts: boolean): Promise<CheckersNewGameResponse> {
    return request<CheckersNewGameResponse>('/api/game/checkers/newgame', {
        method: 'POST',
        body: JSON.stringify({ player_starts: playerStarts }),
    });
}

export async function checkersMove(from: number, to: number): Promise<void> {
    const response = await fetch('/api/game/checkers/move', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_pos: from, to_pos: to }),
    });
    if (!response.ok) {
        const body = await response.json().catch(() => ({ detail: 'Move failed' }));
        throw new GameApiError(body.detail ?? 'Move failed', response.status, null);
    }
}

export function checkersSubscribeSSE(
    sessionId: string,
    handlers: {
        onStatus: (message: string) => void;
        onMove: (data: CheckersMoveData) => void;
        onError: (code: string, message: string) => void;
        onHeartbeat?: () => void;
    }
): EventSource {
    const es = new EventSource(`/api/game/checkers/events/${sessionId}`, {
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
            handlers.onMove(parsed.data as CheckersMoveData);
        } else if (parsed.type === 'error') {
            handlers.onError(parsed.code ?? 'unknown', parsed.message ?? 'Unknown error');
        } else if (parsed.type === 'heartbeat') {
            handlers.onHeartbeat?.();
        }
    };

    return es;
}
