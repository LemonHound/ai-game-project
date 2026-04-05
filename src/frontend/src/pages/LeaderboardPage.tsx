import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchLeaderboard } from '../api/stats';
import PageMeta from '../components/PageMeta';

const BOARD_TYPES = [
    { key: 'games_played', label: 'Games Played' },
    { key: 'streak_high_score', label: 'Best Streak' },
    { key: 'current_streak', label: 'Current Streak' },
] as const;

const GAME_TYPES = [
    { key: 'tic_tac_toe', label: 'Tic-Tac-Toe' },
    { key: 'chess', label: 'Chess' },
    { key: 'checkers', label: 'Checkers' },
    { key: 'connect4', label: 'Connect 4' },
    { key: 'dots_and_boxes', label: 'Dots & Boxes' },
] as const;

export default function LeaderboardPage() {
    const [boardType, setBoardType] = useState('games_played');
    const [gameType, setGameType] = useState('tic_tac_toe');
    const [page, setPage] = useState(1);

    const { data, isLoading } = useQuery({
        queryKey: ['leaderboard', boardType, gameType, page],
        queryFn: () => fetchLeaderboard(boardType, gameType, page),
        staleTime: 60_000,
    });

    const totalPages = data ? Math.ceil(data.total_entries / data.per_page) : 0;

    return (
        <div className='container mx-auto max-w-3xl px-4 py-10'>
            <PageMeta
                title='Leaderboard'
                description='See top players ranked by games played, win streaks, and more.'
            />
            <h1 className='mb-6 text-4xl font-bold'>Leaderboard</h1>

            <div className='flex flex-wrap gap-3 mb-6'>
                <select
                    className='select select-bordered select-sm'
                    value={gameType}
                    onChange={e => {
                        setGameType(e.target.value);
                        setPage(1);
                    }}>
                    {GAME_TYPES.map(g => (
                        <option key={g.key} value={g.key}>
                            {g.label}
                        </option>
                    ))}
                </select>

                <div role='tablist' className='tabs tabs-boxed'>
                    {BOARD_TYPES.map(b => (
                        <button
                            key={b.key}
                            role='tab'
                            className={`tab ${boardType === b.key ? 'tab-active' : ''}`}
                            onClick={() => {
                                setBoardType(b.key);
                                setPage(1);
                            }}>
                            {b.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className='card bg-base-200 shadow'>
                <div className='card-body p-0'>
                    {isLoading ? (
                        <div className='flex justify-center py-10'>
                            <span className='loading loading-spinner loading-lg' />
                        </div>
                    ) : !data || data.entries.length === 0 ? (
                        <p className='py-10 text-center opacity-60'>No entries yet. Play some games!</p>
                    ) : (
                        <div className='overflow-x-auto'>
                            <table className='table'>
                                <thead>
                                    <tr>
                                        <th>Rank</th>
                                        <th>Player</th>
                                        <th className='text-right'>
                                            {boardType === 'games_played' ? 'Games' : 'Streak'}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.entries.map(entry => (
                                        <tr key={entry.user_id}>
                                            <td className='font-mono'>{entry.rank}</td>
                                            <td>{entry.display_name}</td>
                                            <td className='text-right font-mono'>{entry.value}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {totalPages > 1 && (
                <div className='flex justify-center gap-2 mt-4'>
                    <button className='btn btn-sm btn-outline' disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                        Previous
                    </button>
                    <span className='btn btn-sm btn-ghost no-animation'>
                        {page} / {totalPages}
                    </span>
                    <button
                        className='btn btn-sm btn-outline'
                        disabled={page >= totalPages}
                        onClick={() => setPage(p => p + 1)}>
                        Next
                    </button>
                </div>
            )}
        </div>
    );
}
