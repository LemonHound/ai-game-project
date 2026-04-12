import { useCountUp } from '../hooks/useCountUp';

function StatCard({
    value,
    label,
    isFloat,
    isDecimal,
}: {
    value: number;
    label: string;
    isFloat?: boolean;
    isDecimal?: boolean;
}) {
    const animated = useCountUp(value);
    let display: string;
    if (isFloat) {
        display = `${(animated * 100).toFixed(1)}%`;
    } else if (isDecimal) {
        display = animated.toFixed(1);
    } else {
        display = animated.toLocaleString();
    }

    return (
        <div className='card bg-base-200 shadow-sm'>
            <div className='card-body items-center p-4 text-center'>
                <span className='text-3xl font-bold text-primary'>{display}</span>
                <span className='text-sm opacity-70'>{label}</span>
            </div>
        </div>
    );
}

export type AboutPlatformStatsProps = {
    gamesPlayed: number;
    movesAnalyzed: number;
    registeredPlayers: number;
    uniquePlayers: number;
    aiWinRate: number;
    playerWinRate: number;
    avgMovesPerGame: number;
    daysRunning: number;
};

/**
 * Live platform statistics grid for the About page.
 */
export default function AboutPlatformStats({
    gamesPlayed,
    movesAnalyzed,
    registeredPlayers,
    uniquePlayers,
    aiWinRate,
    playerWinRate,
    avgMovesPerGame,
    daysRunning,
}: AboutPlatformStatsProps) {
    return (
        <div className='grid grid-cols-2 gap-4 md:grid-cols-4'>
            <StatCard value={gamesPlayed} label='Games Played' />
            <StatCard value={movesAnalyzed} label='Moves Analyzed' />
            <StatCard value={registeredPlayers} label='Registered Players' />
            <StatCard value={uniquePlayers} label='Active Players' />
            <StatCard value={aiWinRate} label='AI Win Rate' isFloat />
            <StatCard value={playerWinRate} label='Player Win Rate' isFloat />
            <StatCard value={avgMovesPerGame} label='Avg. Moves/Game' isDecimal />
            <StatCard value={daysRunning} label='Days Running' />
        </div>
    );
}
