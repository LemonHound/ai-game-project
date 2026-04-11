import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchGames } from '../api/games';
import GameSummaryCard from '../components/games/GameSummaryCard';
import PageMeta from '../components/PageMeta';
import { GameCardGridSkeleton } from '../components/Skeleton';
import type { Game } from '../types';

const PLACEHOLDER_GAMES: Game[] = [
    {
        id: 'tic-tac-toe',
        name: 'Tic Tac Toe',
        description: 'Classic 3x3 grid game with adaptive AI opponent that learns your strategies',
        icon: '⭕',
        difficulty: 'Very Easy',
        players: 1,
        status: 'active',
        category: 'strategy',
        tags: ['Strategy', 'Quick Play'],
        game_shell_ready: true,
        ai_model_integrated: true,
    },
    {
        id: 'connect4',
        name: 'Connect 4',
        description: 'Drop pieces to connect four in a row - vertically, horizontally, or diagonally',
        icon: '🔴',
        difficulty: 'Very Easy',
        players: 1,
        status: 'active',
        category: 'strategy',
        tags: ['Strategy'],
        game_shell_ready: true,
        ai_model_integrated: false,
    },
    {
        id: 'dots-and-boxes',
        name: 'Dots and Boxes',
        description: 'Connect dots to complete boxes and claim territory in this strategic paper game',
        icon: '⬜',
        difficulty: 'Very Easy',
        players: 1,
        status: 'active',
        category: 'strategy',
        tags: ['Strategy', 'Territory'],
        game_shell_ready: true,
        ai_model_integrated: false,
    },
    {
        id: 'chess',
        name: 'Chess',
        description: 'Chess with AI that learns your playing style and adapts its strategy',
        icon: '♟️',
        difficulty: 'Very Easy',
        players: 1,
        status: 'active',
        category: 'strategy',
        tags: ['Strategy'],
        game_shell_ready: true,
        ai_model_integrated: false,
    },
    {
        id: 'checkers',
        name: 'Checkers',
        description: 'Classic checkers with an AI that adapts to your tactical preferences',
        icon: '⚫',
        difficulty: 'Very Easy',
        players: 1,
        status: 'active',
        category: 'strategy',
        tags: ['Strategy', 'Classic'],
        game_shell_ready: true,
        ai_model_integrated: false,
    },
    {
        id: 'pong',
        name: 'Pong',
        description: 'Classic pong game, popularized by Atari',
        icon: '🕹️',
        difficulty: 'Very Easy',
        players: 1,
        status: 'active',
        category: 'arcade',
        tags: ['Arcade', 'Classic'],
        game_shell_ready: false,
        ai_model_integrated: false,
    },
];

/**
 * Games listing page showing all available games as clickable cards.
 * Falls back to PLACEHOLDER_GAMES if the API returns an empty list.
 */
export default function GamesPage() {
    const {
        data: apiGames,
        isLoading,
        isError,
    } = useQuery({
        queryKey: ['games'],
        queryFn: () => fetchGames(),
    });
    const games = apiGames?.length ? apiGames : PLACEHOLDER_GAMES;

    return (
        <div className='container mx-auto max-w-6xl px-4 py-10'>
            <PageMeta
                title='Games'
                description='Browse all available games -- from Tic Tac Toe to Chess, each with an adaptive AI opponent.'
                ogImage='/images/og/og-games.png'
            />
            <div className='mb-8 flex flex-wrap items-end justify-between gap-4'>
                <h1 className='text-4xl font-bold'>Games</h1>
                <div className='flex flex-wrap gap-3 text-sm'>
                    <Link to='/' className='link link-hover'>
                        Home
                    </Link>
                    <Link to='/stats' className='link link-hover'>
                        Stats
                    </Link>
                    <Link to='/about' className='link link-hover'>
                        About
                    </Link>
                </div>
            </div>

            {isLoading && <GameCardGridSkeleton cards={6} />}
            {isError && <p className='text-error'>Could not load games from the server. Showing cached defaults.</p>}
            {!isLoading && (
                <div className='grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3'>
                    {games.map(game => (
                        <GameSummaryCard key={game.id} game={game} />
                    ))}
                </div>
            )}
        </div>
    );
}
