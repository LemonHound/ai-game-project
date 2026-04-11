import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchAboutStats } from '../api/about';
import { fetchGames } from '../api/games';
import AboutPlatformStats from '../components/AboutPlatformStats';
import GameSummaryCard from '../components/games/GameSummaryCard';
import PageMeta from '../components/PageMeta';
import { GameCardGridSkeleton, StatGridSkeleton } from '../components/Skeleton';

/**
 * Landing page with quick navigation to games, platform stats, and other main sections.
 */
export default function HomePage() {
    const gamesQuery = useQuery({
        queryKey: ['games', 'home'],
        queryFn: () => fetchGames('active'),
    });
    const statsQuery = useQuery({
        queryKey: ['about-stats'],
        queryFn: fetchAboutStats,
        staleTime: 60_000,
    });

    const games = gamesQuery.data ?? [];

    return (
        <>
            <PageMeta
                title='AI Game Hub'
                description='Play classic games against adaptive AI. Browse games, see live platform stats, and jump to rankings.'
                ogImage='/images/og/og-home.png'
            />
            <div className='hero min-h-[40vh] bg-base-200'>
                <div className='hero-content flex-col px-4 py-12 text-center'>
                    <h1 className='text-5xl font-bold'>AI Game Hub</h1>
                    <p className='max-w-2xl py-6 text-lg opacity-80'>
                        Play classic games against adaptive AI. Pick a game below, open the full catalog for details, or
                        explore public rankings and your account from the navigation bar.
                    </p>
                    <div className='flex flex-wrap justify-center gap-3'>
                        <Link to='/games' className='btn btn-primary'>
                            All games
                        </Link>
                        <Link to='/stats' className='btn btn-outline'>
                            Public stats
                        </Link>
                        <Link to='/about' className='btn btn-ghost'>
                            About
                        </Link>
                    </div>
                </div>
            </div>

            <div className='container mx-auto max-w-6xl px-4 py-12'>
                <section className='mb-14'>
                    <div className='mb-4 flex flex-wrap items-end justify-between gap-4'>
                        <h2 className='text-2xl font-semibold'>Active games</h2>
                        <Link to='/games' className='link link-primary text-sm'>
                            Details for every game
                        </Link>
                    </div>
                    {gamesQuery.isLoading && <GameCardGridSkeleton cards={6} />}
                    {gamesQuery.isError && (
                        <p className='text-error'>Could not load games. Try again from the Games page.</p>
                    )}
                    {!gamesQuery.isLoading && !gamesQuery.isError && games.length === 0 && (
                        <p className='opacity-70'>No active games are listed yet.</p>
                    )}
                    {!gamesQuery.isLoading && !gamesQuery.isError && games.length > 0 && (
                        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
                            {games.map(game => (
                                <GameSummaryCard key={game.id} game={game} compact />
                            ))}
                        </div>
                    )}
                </section>

                <section className='mb-14'>
                    <div className='mb-4 flex flex-wrap items-end justify-between gap-4'>
                        <h2 className='text-2xl font-semibold'>Platform stats</h2>
                        <Link to='/stats' className='link link-primary text-sm'>
                            Deep dive into rankings
                        </Link>
                    </div>
                    {statsQuery.isLoading && <StatGridSkeleton count={6} />}
                    {statsQuery.isError && <p className='text-error'>Could not load platform statistics right now.</p>}
                    {statsQuery.data && (
                        <AboutPlatformStats
                            gamesPlayed={statsQuery.data.games_played}
                            movesAnalyzed={statsQuery.data.moves_analyzed}
                            uniquePlayers={statsQuery.data.unique_players}
                            aiWinRate={statsQuery.data.ai_win_rate}
                            trainingMoves={statsQuery.data.training_moves}
                            daysRunning={statsQuery.data.days_running}
                        />
                    )}
                </section>

                <section className='rounded-box bg-base-200 p-6'>
                    <h2 className='mb-3 text-xl font-semibold'>Find everything quickly</h2>
                    <ul className='grid gap-2 text-sm opacity-90 sm:grid-cols-2'>
                        <li>
                            <Link to='/games' className='link'>
                                Games
                            </Link>{' '}
                            — full descriptions, difficulty, and AI status for each title.
                        </li>
                        <li>
                            <Link to='/stats' className='link'>
                                Stats
                            </Link>{' '}
                            — per-game leaderboards and streak boards for public profiles.
                        </li>
                        <li>
                            <Link to='/about' className='link'>
                                About
                            </Link>{' '}
                            — team, mission, and extra platform context.
                        </li>
                        <li>
                            <Link to='/profile' className='link'>
                                Profile
                            </Link>{' '}
                            — your results after you sign in (also under your avatar menu).
                        </li>
                    </ul>
                </section>
            </div>
        </>
    );
}
