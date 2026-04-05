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

export async function fetchMyStats(): Promise<StatsResponse> {
    return request<StatsResponse>('/api/stats/me');
}

export async function fetchUserStats(userId: number): Promise<StatsResponse> {
    return request<StatsResponse>(`/api/stats/user/${userId}`);
}

export async function fetchLeaderboard(
    boardType: string,
    gameType: string,
    page = 1,
    perPage = 10,
): Promise<LeaderboardResponse> {
    const params = new URLSearchParams({
        game_type: gameType,
        page: String(page),
        per_page: String(perPage),
    });
    return request<LeaderboardResponse>(`/api/leaderboard/${boardType}?${params}`);
}

export async function updateStatsPublic(statsPublic: boolean): Promise<{ statsPublic: boolean }> {
    return request<{ statsPublic: boolean }>('/api/auth/settings', {
        method: 'PATCH',
        body: JSON.stringify({ statsPublic }),
    });
}
