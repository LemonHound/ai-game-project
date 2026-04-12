export interface AboutStats {
    games_played: number;
    moves_analyzed: number;
    registered_players: number;
    unique_players: number;
    ai_win_rate: number;
    player_win_rate: number;
    avg_moves_per_game: number;
    days_running: number;
    monthly_cost_usd: number;
}

/** Fetches platform statistics for the About page. */
export async function fetchAboutStats(): Promise<AboutStats> {
    const res = await fetch('/api/about/stats');
    if (!res.ok) {
        throw new Error(`Failed to fetch about stats: ${res.status}`);
    }
    return res.json();
}
