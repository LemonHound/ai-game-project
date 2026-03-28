import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchGames } from '../api/games';
import type { Game } from '../types';

const GAME_ROUTES: Record<string, string> = {
    'tic-tac-toe': '/game/tic-tac-toe',
    chess: '/game/chess',
    checkers: '/game/checkers',
    connect4: '/game/connect4',
    'dots-and-boxes': '/game/dots-and-boxes',
    pong: '/game/pong',
};

const PLACEHOLDER_GAMES: Game[] = [
    {
        id: 'tic-tac-toe',
        name: 'Tic Tac Toe',
        description: 'Classic 3x3 grid game with adaptive AI opponent that learns your strategies',
        icon: '⭕',
        difficulty: 'Easy',
        players: '1',
        status: 'active',
        category: 'strategy',
        tags: ['Strategy', '1 Player', 'Quick Play'],
    },
    {
        id: 'connect4',
        name: 'Connect 4',
        description: 'Drop pieces to connect four in a row - vertically, horizontally, or diagonally',
        icon: '🔴',
        difficulty: 'Medium',
        players: '1',
        status: 'active',
        category: 'strategy',
        tags: ['Strategy', '1 Player', 'Coming Soon'],
    },
    {
        id: 'dots-and-boxes',
        name: 'Dots and Boxes',
        description: 'Connect dots to complete boxes and claim territory in this strategic paper game',
        icon: '⬜',
        difficulty: 'Medium',
        players: '1',
        status: 'active',
        category: 'strategy',
        tags: ['Strategy', '1 Player', 'Coming Soon'],
    },
    {
        id: 'chess',
        name: 'Chess',
        description: 'Chess with AI that learns your playing style and adapts its strategy',
        icon: '♟️',
        difficulty: 'Expert',
        players: '1',
        status: 'active',
        category: 'strategy',
        tags: ['Strategy', '1 Player', 'Coming Soon'],
    },
    {
        id: 'checkers',
        name: 'Checkers',
        description: 'Classic checkers with an AI that adapts to your tactical preferences',
        icon: '⚫',
        difficulty: 'Hard',
        players: '1',
        status: 'active',
        category: 'strategy',
        tags: ['Strategy', '1 Player', 'Coming Soon'],
    },
    {
        id: 'pong',
        name: 'Pong',
        description: 'Classic pong game, popularized by Atari',
        icon: '🕹️',
        difficulty: 'Easy',
        players: '1',
        status: 'active',
        category: 'arcade',
        tags: ['Arcade', '1 Player', 'Coming Soon'],
    },
];

export default function GamesPage() {
    const { data: apiGames, isLoading } = useQuery({
        queryKey: ['games'],
        queryFn: fetchGames,
    });
    const games = apiGames?.length ? apiGames : PLACEHOLDER_GAMES;

    return (
        <div className='container mx-auto px-4 py-10'>
            <h1 className='mb-8 text-4xl font-bold'>Games</h1>

            {isLoading ? (
                <div className='flex justify-center py-20'>
                    <span className='loading loading-spinner loading-lg' />
                </div>
            ) : (
                <div className='grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3'>
                    {games.map(game => {
                        const isComingSoon = game.tags.includes('Coming Soon');
                        return (
                            <Link
                                key={game.id}
                                to={GAME_ROUTES[game.id] ?? `/game/${game.id}`}
                                className='card bg-base-200 shadow-md transition-shadow hover:shadow-xl'>
                                <div className='card-body'>
                                    <div className='text-4xl'>{game.icon}</div>
                                    <h2 className='card-title'>{game.name}</h2>
                                    <p className='text-sm opacity-70'>{game.description}</p>
                                    <div className='card-actions mt-2'>
                                        <div className='badge badge-outline'>{game.difficulty}</div>
                                        <div className='badge badge-outline'>{game.players}</div>
                                        {isComingSoon && <div className='badge badge-neutral'>Coming Soon</div>}
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
