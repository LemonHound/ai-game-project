export interface AboutStats {
    games_played: number;
    moves_analyzed: number;
    unique_players: number;
    ai_win_rate: number;
    training_moves: number;
    days_running: number;
}

export async function fetchAboutStats(): Promise<AboutStats> {
    const res = await fetch('/api/about/stats');
    if (!res.ok) {
        throw new Error(`Failed to fetch about stats: ${res.status}`);
    }
    return res.json();
}
