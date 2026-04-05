import type { LeaderboardResponse, StatsResponse } from '../types';

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

/**
 * Fetch per-game stats for the authenticated user.
 *
 * @returns Per-game stats keyed by game type.
 */
export async function fetchMyStats(): Promise<StatsResponse> {
    return request<StatsResponse>('/api/stats/me');
}

/**
 * Fetch per-game stats for another user.
 *
 * @param userId - Target user ID.
 * @returns Per-game stats keyed by game type.
 */
export async function fetchUserStats(userId: number): Promise<StatsResponse> {
    return request<StatsResponse>(`/api/stats/user/${userId}`);
}

/**
 * Fetch a paginated per-game leaderboard.
 *
 * @param boardType - One of games_played, streak_high_score, current_streak.
 * @param gameType - Game type key (e.g. tic_tac_toe, chess).
 * @param page - Page number (default 1).
 * @param perPage - Results per page (default 10).
 * @returns Paginated leaderboard response.
 */
export async function fetchLeaderboard(
    boardType: string,
    gameType: string,
    page = 1,
    perPage = 10
): Promise<LeaderboardResponse> {
    const params = new URLSearchParams({
        game_type: gameType,
        page: String(page),
        per_page: String(perPage),
    });
    return request<LeaderboardResponse>(`/api/leaderboard/${boardType}?${params}`);
}

/**
 * Toggle the stats_public setting for the authenticated user.
 *
 * @param statsPublic - Whether stats should be publicly visible.
 * @returns Updated statsPublic value.
 */
export async function updateStatsPublic(statsPublic: boolean): Promise<{ statsPublic: boolean }> {
    return request<{ statsPublic: boolean }>('/api/auth/settings', {
        method: 'PATCH',
        body: JSON.stringify({ statsPublic }),
    });
}
