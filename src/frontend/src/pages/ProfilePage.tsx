import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchMyStats } from '../api/stats';
import { useAuth } from '../hooks/useAuth';
import PageMeta from '../components/PageMeta';
import type { GameStats } from '../types';

const GAME_LABELS: Record<string, string> = {
    tic_tac_toe: 'Tic-Tac-Toe',
    chess: 'Chess',
    checkers: 'Checkers',
    connect4: 'Connect 4',
    dots_and_boxes: 'Dots & Boxes',
};

function GameStatCard({ label, stats }: { label: string; stats: GameStats }) {
    if (stats.games_played === 0) return null;
    return (
        <div className='card bg-base-300 p-3'>
            <h4 className='text-sm font-semibold mb-2'>{label}</h4>
            <div className='grid grid-cols-3 gap-1 text-center text-xs'>
                <div>
                    <p className='font-bold'>{stats.games_played}</p>
                    <p className='opacity-60'>Played</p>
                </div>
                <div>
                    <p className='font-bold'>{Math.round(stats.win_rate * 100)}%</p>
                    <p className='opacity-60'>Win Rate</p>
                </div>
                <div>
                    <p className='font-bold'>{stats.best_streak}</p>
                    <p className='opacity-60'>Best Streak</p>
                </div>
            </div>
        </div>
    );
}

export default function ProfilePage() {
    const { user, isLoading } = useAuth();

    const { data: statsData } = useQuery({
        queryKey: ['myStats'],
        queryFn: fetchMyStats,
        staleTime: 60_000,
        enabled: !!user,
    });

    if (isLoading) {
        return (
            <div className='flex justify-center py-20'>
                <span className='loading loading-spinner loading-lg' />
            </div>
        );
    }

    if (!user) {
        return (
            <div className='flex flex-col items-center gap-4 py-20'>
                <p className='text-lg'>You are not logged in.</p>
                <Link to='/' className='btn btn-primary'>
                    Go Home
                </Link>
            </div>
        );
    }

    const gameEntries = statsData
        ? Object.entries(statsData.per_game).filter(
              ([key, s]) => key in GAME_LABELS && s.games_played > 0,
          )
        : [];

    return (
        <div className='container mx-auto max-w-2xl px-4 py-10'>
            <PageMeta title='Profile' noindex />
            <h1 className='mb-6 text-4xl font-bold'>Profile</h1>
            <div className='card bg-base-200 shadow'>
                <div className='card-body gap-4'>
                    <div className='flex items-center gap-4'>
                        <div className='avatar placeholder'>
                            <div className='bg-neutral text-neutral-content w-16 rounded-full'>
                                <span className='text-2xl'>{user.displayName[0].toUpperCase()}</span>
                            </div>
                        </div>
                        <div>
                            <h2 className='text-xl font-semibold'>{user.displayName}</h2>
                            <p className='text-sm opacity-60'>@{user.username}</p>
                        </div>
                    </div>
                    <div className='divider' />
                    <div className='grid grid-cols-2 gap-4 text-sm'>
                        <div>
                            <p className='opacity-60'>Email</p>
                            <p>{user.email}</p>
                        </div>
                        <div>
                            <p className='opacity-60'>Auth Provider</p>
                            <p className='capitalize'>{user.authProvider}</p>
                        </div>
                    </div>
                </div>
            </div>

            {gameEntries.length > 0 && (
                <>
                    <h2 className='mt-8 mb-4 text-2xl font-bold'>Game Stats</h2>
                    <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                        {gameEntries.map(([key, stats]) => (
                            <GameStatCard key={key} label={GAME_LABELS[key]} stats={stats} />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
