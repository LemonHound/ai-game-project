import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { fetchAboutStats } from '../api/about';
import AboutPlatformStats from '../components/AboutPlatformStats';
import PageMeta from '../components/PageMeta';
import { StatGridSkeleton } from '../components/Skeleton';
import { useCountUp } from '../hooks/useCountUp';

const DONATE_URLS = {
    buyMeACoffee: 'https://buymeacoffee.com/',
    patreon: 'https://patreon.com/',
};

const TEAM_MEMBERS = [
    {
        name: 'Member One',
        role: 'Full-Stack Developer',
        bio: 'Passionate about game AI and building things people enjoy playing.',
        photo: 'https://placehold.co/128x128/374151/e5e7eb?text=M1',
        github: 'https://github.com/',
        linkedin: 'https://linkedin.com/',
    },
    {
        name: 'Member Two',
        role: 'AI & Game Design',
        bio: 'Loves exploring adaptive algorithms and making classic games feel fresh.',
        photo: 'https://placehold.co/128x128/374151/e5e7eb?text=M2',
        github: 'https://github.com/',
        linkedin: 'https://linkedin.com/',
    },
];

function seededRandom(seed: number): number {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

function PlaceholderStatCard({ value, label }: { value: number; label: string }) {
    const animated = useCountUp(value);
    return (
        <div className='card bg-base-200 shadow-sm'>
            <div className='card-body items-center p-4 text-center'>
                <span className='text-3xl font-bold text-primary'>{animated.toLocaleString()}</span>
                <span className='text-sm opacity-70'>{label}</span>
            </div>
        </div>
    );
}

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

    const placeholders = useMemo(() => {
        const seed = Date.now();
        return {
            aiIterations: Math.floor(seededRandom(seed) * 8999) + 1000,
            bugsSquashed: Math.floor(seededRandom(seed + 1) * 450) + 50,
        };
    }, []);

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
                    <div className='space-y-4'>
                        <AboutPlatformStats
                            gamesPlayed={stats.games_played}
                            movesAnalyzed={stats.moves_analyzed}
                            uniquePlayers={stats.unique_players}
                            aiWinRate={stats.ai_win_rate}
                            trainingMoves={stats.training_moves}
                            daysRunning={stats.days_running}
                        />
                        <div className='grid grid-cols-2 gap-4 md:grid-cols-4'>
                            <PlaceholderStatCard value={placeholders.aiIterations} label='AI Iterations' />
                            <PlaceholderStatCard value={placeholders.bugsSquashed} label='Bugs Squashed' />
                        </div>
                    </div>
                )}
            </section>

            <section className='mb-12'>
                <h2 className='mb-4 text-2xl font-semibold'>Meet the Team</h2>
                <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
                    {TEAM_MEMBERS.map(member => (
                        <div key={member.name} className='card bg-base-200 shadow-sm'>
                            <div className='card-body flex-row items-center gap-4'>
                                <div className='avatar'>
                                    <div className='w-20 rounded-full'>
                                        <img src={member.photo} alt={member.name} />
                                    </div>
                                </div>
                                <div className='flex-1'>
                                    <h3 className='text-lg font-bold'>{member.name}</h3>
                                    <p className='text-sm opacity-60'>{member.role}</p>
                                    <p className='mt-1 text-sm'>{member.bio}</p>
                                    <div className='mt-2 flex gap-3'>
                                        <a
                                            href={member.github}
                                            target='_blank'
                                            rel='noopener noreferrer'
                                            className='link link-hover text-sm opacity-70'>
                                            GitHub
                                        </a>
                                        <a
                                            href={member.linkedin}
                                            target='_blank'
                                            rel='noopener noreferrer'
                                            className='link link-hover text-sm opacity-70'>
                                            LinkedIn
                                        </a>
                                    </div>
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
