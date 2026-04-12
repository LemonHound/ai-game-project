import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchAboutStats } from '../api/about';
import AboutPlatformStats from '../components/AboutPlatformStats';
import PageMeta from '../components/PageMeta';
import { StatGridSkeleton } from '../components/Skeleton';

const DONATE_URLS = {
    buyMeACoffee: 'https://buymeacoffee.com/aigamehub',
    patreon: 'https://www.patreon.com/cw/AIGameHub',
};

const TEAM_MEMBERS = [
    {
        name: 'Kevin Zookski',
        role: 'Architect & Engineer',
        bio: 'Kevin has held roles across every layer of the stack over his career — product, design, frontend, backend, and database. He designed and built AI Game Hub from the ground up.',
        initials: 'KZ',
        // TODO: Brian to update
    },
    {
        name: 'Brian Waskevich',
        role: 'ML & Data',
        bio: 'Brian has taken sole ownership of the ML models, training pipeline, and the database schema designed to let the AI adapt quickly to different playstyles.',
        initials: 'BW',
        // TODO: Brian to update — add social links when ready
    },
];

/** Renders the About page with live platform stats, team section, and donation links. */
export default function AboutPage() {
    const {
        data: stats,
        isLoading,
        isError,
    } = useQuery({
        queryKey: ['about-stats'],
        queryFn: fetchAboutStats,
        staleTime: 60_000,
    });

    return (
        <div className='container mx-auto max-w-5xl px-4 py-10'>
            <PageMeta
                title='About'
                description='Meet the team behind AI Game Hub and see live platform stats.'
                ogImage='/images/og/og-about.png'
            />
            <h1 className='mb-6 text-4xl font-bold'>About AI Game Hub</h1>

            <p className='mb-10 max-w-3xl text-lg leading-relaxed opacity-90'>
                AI Game Hub is a passion project built around one idea: classic games are more fun when your opponent
                learns. Every game on this platform features an adaptive AI that studies your play style and adjusts its
                strategy. We collect training data from every match to make the AI smarter over time. It started as a
                side project and grew into something we are genuinely proud of.
            </p>

            <section className='mb-12'>
                <div className='mb-4 flex flex-wrap items-end justify-between gap-4'>
                    <h2 className='text-2xl font-semibold'>Platform Stats</h2>
                    <Link to='/stats' className='link link-primary text-sm'>
                        Public rankings
                    </Link>
                </div>
                {isLoading && <StatGridSkeleton count={8} />}
                {isError && <p className='text-error'>Could not load platform statistics.</p>}
                {stats && (
                    <AboutPlatformStats
                        gamesPlayed={stats.games_played}
                        movesAnalyzed={stats.moves_analyzed}
                        registeredPlayers={stats.registered_players}
                        uniquePlayers={stats.unique_players}
                        aiWinRate={stats.ai_win_rate}
                        playerWinRate={stats.player_win_rate}
                        avgMovesPerGame={stats.avg_moves_per_game}
                        daysRunning={stats.days_running}
                    />
                )}
            </section>

            <section className='mb-12'>
                <h2 className='mb-4 text-2xl font-semibold'>Meet the Team</h2>
                <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
                    {TEAM_MEMBERS.map(member => (
                        <div key={member.name} className='card bg-base-200 shadow-sm'>
                            <div className='card-body flex-row items-center gap-4'>
                                <div className='avatar placeholder'>
                                    <div className='w-20 rounded-full bg-neutral text-neutral-content'>
                                        <span className='text-2xl'>{member.initials}</span>
                                    </div>
                                </div>
                                <div className='flex-1'>
                                    <h3 className='text-lg font-bold'>{member.name}</h3>
                                    <p className='text-sm opacity-60'>{member.role}</p>
                                    <p className='mt-1 text-sm'>{member.bio}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section>
                <p className='mb-3 text-sm opacity-60'>
                    If you are enjoying the games, contributions help keep the servers running.
                </p>
                {stats && (
                    <p className='mb-3 text-sm opacity-70'>
                        Hosting and AI model costs run ~${stats.monthly_cost_usd}/month. Contributions of any size help
                        keep the games running.
                    </p>
                )}
                <div className='flex gap-3'>
                    <a
                        href={DONATE_URLS.buyMeACoffee}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='btn btn-outline btn-sm'>
                        Buy us a coffee
                    </a>
                    <a
                        href={DONATE_URLS.patreon}
                        target='_blank'
                        rel='noopener noreferrer'
                        className='btn btn-outline btn-sm'>
                        Support on Patreon
                    </a>
                </div>
            </section>
        </div>
    );
}
