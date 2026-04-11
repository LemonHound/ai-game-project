import { Link } from 'react-router-dom';
import type { Game } from '../../types';
import { GAME_ROUTES } from '../../gameRoutes';

export type GameSummaryCardProps = {
    game: Game;
    compact?: boolean;
};

/**
 * Clickable game summary used on the home page and anywhere a short game preview is needed.
 */
export default function GameSummaryCard({ game, compact = false }: GameSummaryCardProps) {
    const href = GAME_ROUTES[game.id] ?? `/game/${game.id}`;
    const playable = game.game_shell_ready;
    const hasAi = game.ai_model_integrated;

    return (
        <Link to={href} className='card bg-base-200 shadow-md transition-shadow hover:shadow-xl'>
            <div className={`card-body ${compact ? 'gap-2 p-4' : ''}`}>
                <div className='text-3xl'>{game.icon}</div>
                <h2 className={`card-title ${compact ? 'text-lg' : ''}`}>{game.name}</h2>
                <p
                    className={`text-sm opacity-70 ${compact ? 'truncate' : ''}`.trim()}
                    title={compact ? game.description : undefined}>
                    {game.description}
                </p>
                <div className='card-actions mt-1 flex flex-wrap gap-2'>
                    {!playable && (
                        <div
                            className='badge badge-neutral badge-outline'
                            title='This game is not wired up in the client yet.'>
                            Not available yet
                        </div>
                    )}
                    {playable && !hasAi && (
                        <>
                            <div
                                className='badge badge-warning badge-outline'
                                title='You can open the game, but no adaptive model is connected yet.'>
                                No trained AI yet
                            </div>
                            <div
                                className='badge badge-outline'
                                title='Heuristic placeholder only until the adaptive model is connected.'>
                                AI Difficulty: {game.difficulty}
                            </div>
                        </>
                    )}
                    {playable && hasAi && <div className='badge badge-outline'>AI Difficulty: {game.difficulty}</div>}
                    {game.tags.slice(0, compact ? 2 : 4).map(tag => (
                        <div key={tag} className='badge badge-ghost badge-sm'>
                            {tag}
                        </div>
                    ))}
                </div>
            </div>
        </Link>
    );
}
