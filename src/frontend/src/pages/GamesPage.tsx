import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchGames } from '../api/games';

const GAME_ROUTES: Record<string, string> = {
    'tic-tac-toe': '/game/tic-tac-toe',
    chess: '/game/chess',
    checkers: '/game/checkers',
    connect4: '/game/connect4',
    'dots-and-boxes': '/game/dots-and-boxes',
    pong: '/game/pong',
};

export default function GamesPage() {
    const { data: games = [], isLoading } = useQuery({
        queryKey: ['games'],
        queryFn: fetchGames,
    });

    return (
        <div className="container mx-auto px-4 py-10">
            <h1 className="mb-8 text-4xl font-bold">Games</h1>

            {isLoading ? (
                <div className="flex justify-center py-20">
                    <span className="loading loading-spinner loading-lg" />
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {games.map(game => (
                        <Link
                            key={game.id}
                            to={GAME_ROUTES[game.id] ?? `/game/${game.id}`}
                            className="card bg-base-200 shadow-md transition-shadow hover:shadow-xl"
                        >
                            <div className="card-body">
                                <div className="text-4xl">{game.icon}</div>
                                <h2 className="card-title">{game.name}</h2>
                                <p className="text-sm opacity-70">{game.description}</p>
                                <div className="card-actions mt-2">
                                    <div className="badge badge-outline">{game.difficulty}</div>
                                    <div className="badge badge-outline">{game.players}</div>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
