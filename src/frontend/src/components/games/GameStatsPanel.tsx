import { useQuery } from '@tanstack/react-query';
import { fetchMyStats } from '../../api/stats';
import { SkeletonBlock } from '../Skeleton';
import type { GameStats } from '../../types';

const STATS_QUERY_KEY = ['myStats'] as const;

function StatItem({ label, value }: { label: string; value: string | number }) {
    return (
        <div className='text-center'>
            <p className='text-lg font-bold'>{value}</p>
            <p className='text-xs opacity-60'>{label}</p>
        </div>
    );
}

/**
 * Displays the authenticated user's stats for a single game type (played, win rate, streaks).
 */
export default function GameStatsPanel({ gameType }: { gameType: string }) {
    const { data, isLoading } = useQuery({
        queryKey: STATS_QUERY_KEY,
        queryFn: fetchMyStats,
        staleTime: 60_000,
    });

    if (isLoading) {
        return (
            <div className='card bg-base-200 mt-4'>
                <div className='card-body gap-3 p-4'>
                    <SkeletonBlock className='h-4 w-24' />
                    <div className='grid grid-cols-4 gap-2'>
                        {Array.from({ length: 4 }).map((_, i) => (
                            <SkeletonBlock key={i} className='mx-auto h-10 w-full max-w-[4.5rem]' />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    const stats: GameStats | undefined = data?.per_game[gameType];
    if (!stats || stats.games_played === 0) return null;

    const winRatePercent = `${Math.round(stats.win_rate * 100)}%`;

    return (
        <div className='card bg-base-200 mt-4'>
            <div className='card-body p-4'>
                <h3 className='text-sm font-semibold opacity-70'>Your Stats</h3>
                <div className='grid grid-cols-4 gap-2'>
                    <StatItem label='Played' value={stats.games_played} />
                    <StatItem label='Win Rate' value={winRatePercent} />
                    <StatItem label='Best Streak' value={stats.best_streak} />
                    <StatItem label='Current' value={stats.current_streak} />
                </div>
            </div>
        </div>
    );
}
