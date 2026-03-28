import { GameApiError } from './games';

export interface ChessGameState {
    board: (string | null)[][];
    current_player: 'white' | 'black';
    player_color: 'white' | 'black';
    game_active: boolean;
    player_starts: boolean;
    king_positions: { white: [number, number]; black: [number, number] };
    castling_rights: {
        white: { kingside: boolean; queenside: boolean };
        black: { kingside: boolean; queenside: boolean };
    };
    en_passant_target: [number, number] | null;
    captured_pieces: { player: string[]; ai: string[] };
    last_move: {
        fromRow: number;
        fromCol: number;
        toRow: number;
        toCol: number;
        piece: string;
        captured: string | null;
        is_castling: boolean;
        is_en_passant: boolean;
        promotion: string | null;
        notation: string;
    } | null;
    in_check: boolean;
}

export interface ChessMoveData extends Partial<ChessGameState> {
    fromRow: number | null;
    fromCol: number | null;
    toRow: number | null;
    toCol: number | null;
    piece: string | null;
    captured: string | null;
    is_castling: boolean;
    is_en_passant: boolean;
    promotion: string | null;
    notation: string | null;
    player: 'player' | 'ai';
    status: 'in_progress' | 'complete';
    winner: 'player' | 'ai' | 'draw' | null;
}

export interface ChessResumeResponse {
    session_id: string | null;
    state: ChessGameState | null;
}

export interface ChessNewGameResponse {
    session_id: string;
    state: ChessGameState;
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

export async function chessResume(): Promise<ChessResumeResponse> {
    return request<ChessResumeResponse>('/api/game/chess/resume');
}

export async function chessNewGame(playerStarts: boolean): Promise<ChessNewGameResponse> {
    return request<ChessNewGameResponse>('/api/game/chess/newgame', {
        method: 'POST',
        body: JSON.stringify({ player_starts: playerStarts }),
    });
}

export async function chessMove(
    fromRow: number,
    fromCol: number,
    toRow: number,
    toCol: number,
    promotionPiece?: string
): Promise<void> {
    const response = await fetch('/api/game/chess/move', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromRow, fromCol, toRow, toCol, promotionPiece: promotionPiece ?? null }),
    });
    if (!response.ok) {
        const body = await response.json().catch(() => ({ detail: 'Move failed' }));
        throw new GameApiError(body.detail ?? 'Move failed', response.status, null);
    }
}

export function chessSubscribeSSE(
    sessionId: string,
    handlers: {
        onStatus: (message: string) => void;
        onMove: (data: ChessMoveData) => void;
        onError: (code: string, message: string) => void;
        onHeartbeat?: () => void;
    }
): EventSource {
    const es = new EventSource(`/api/game/chess/events/${sessionId}`, {
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
            handlers.onMove(parsed.data as ChessMoveData);
        } else if (parsed.type === 'error') {
            handlers.onError(parsed.code ?? 'unknown', parsed.message ?? 'Unknown error');
        } else if (parsed.type === 'heartbeat') {
            handlers.onHeartbeat?.();
        }
    };

    return es;
}

export async function chessLegalMoves(fromRow: number, fromCol: number): Promise<{ toRow: number; toCol: number }[]> {
    const data = await request<{ moves: { toRow: number; toCol: number }[] }>(
        `/api/game/chess/legal-moves?from_row=${fromRow}&from_col=${fromCol}`
    );
    return data.moves;
}
