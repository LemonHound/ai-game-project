import { GameApiError } from './games';

export interface DaBGameState {
    grid_size: number;
    horizontal_lines: Record<string, 'player' | 'ai'>;
    vertical_lines: Record<string, 'player' | 'ai'>;
    boxes: Record<string, 'player' | 'ai'>;
    current_turn: 'player' | 'ai' | null;
    game_active: boolean;
    player_starts: boolean;
    player_score: number;
    ai_score: number;
    move_count: number;
    last_move: {
        type: 'horizontal' | 'vertical';
        row: number;
        col: number;
        boxes_completed: number;
        newly_claimed_boxes: { row: number; col: number }[];
    } | null;
}

export interface DaBResumeResponse {
    session_id: string | null;
    state: DaBGameState | null;
}

export interface DaBNewGameResponse {
    session_id: string;
    state: DaBGameState;
}

export interface DaBMoveData extends Partial<DaBGameState> {
    line_type: 'horizontal' | 'vertical' | null;
    row: number | null;
    col: number | null;
    player: 'player' | 'ai';
    boxes_completed: number;
    newly_claimed_boxes: { row: number; col: number }[];
    status: 'in_progress' | 'complete';
    winner: 'player' | 'ai' | 'draw' | null;
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

export async function dabResume(): Promise<DaBResumeResponse> {
    return request<DaBResumeResponse>('/api/game/dots-and-boxes/resume');
}

export async function dabNewGame(playerStarts: boolean): Promise<DaBNewGameResponse> {
    return request<DaBNewGameResponse>('/api/game/dots-and-boxes/newgame', {
        method: 'POST',
        body: JSON.stringify({ player_starts: playerStarts }),
    });
}

export async function dabMove(type: 'horizontal' | 'vertical', row: number, col: number): Promise<void> {
    const response = await fetch('/api/game/dots-and-boxes/move', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, row, col }),
    });
    if (!response.ok) {
        const body = await response.json().catch(() => ({ detail: 'Move failed' }));
        throw new GameApiError(body.detail ?? 'Move failed', response.status, null);
    }
}

export function dabSubscribeSSE(
    sessionId: string,
    handlers: {
        onStatus: (message: string) => void;
        onMove: (data: DaBMoveData) => void;
        onError: (code: string, message: string) => void;
        onHeartbeat?: () => void;
    }
): EventSource {
    const es = new EventSource(`/api/game/dots-and-boxes/events/${sessionId}`, {
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
            handlers.onMove(parsed.data as DaBMoveData);
        } else if (parsed.type === 'error') {
            handlers.onError(parsed.code ?? 'unknown', parsed.message ?? 'Unknown error');
        } else if (parsed.type === 'heartbeat') {
            handlers.onHeartbeat?.();
        }
    };

    return es;
}
