export interface User {
    id: number;
    username: string;
    email: string;
    displayName: string;
    profilePicture?: string;
    authProvider: 'local' | 'google';
    emailVerified: boolean;
    lastLogin?: string;
    statsPublic: boolean;
}

export interface Game {
    id: string;
    name: string;
    description: string;
    icon: string;
    difficulty: string;
    players: string | number;
    status: string;
    category: string;
    tags: string[];
    game_shell_ready: boolean;
    ai_model_integrated: boolean;
}

export interface ApiError {
    detail: string;
}

export interface GameStats {
    games_played: number;
    wins: number;
    losses: number;
    draws: number;
    games_abandoned: number;
    win_rate: number;
    best_streak: number;
    current_streak: number;
    avg_duration_seconds: number;
}

export interface StatsResponse {
    per_game: Record<string, GameStats>;
}

export interface LeaderboardEntry {
    rank: number;
    user_id: number;
    display_name: string;
    value: number;
}

export interface LeaderboardResponse {
    board_type: string;
    game_type: string;
    entries: LeaderboardEntry[];
    page: number;
    per_page: number;
    total_entries: number;
}
