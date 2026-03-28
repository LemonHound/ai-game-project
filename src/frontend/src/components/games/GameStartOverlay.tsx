interface GameStartOverlayProps {
    canResume: boolean;
    onResume: () => void;
    optionA: { label: string; onClick: () => void };
    optionB: { label: string; onClick: () => void };
}

export default function GameStartOverlay({ canResume, onResume, optionA, optionB }: GameStartOverlayProps) {
    return (
        <div className='absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 rounded-lg bg-base-100/90 backdrop-blur-sm'>
            <button className='btn btn-wide' disabled={!canResume} onClick={canResume ? onResume : undefined}>
                Continue Game
            </button>

            <div className='flex flex-col items-center gap-2 w-full max-w-xs px-4'>
                <div className='flex items-center gap-2 w-full'>
                    <div className='flex-1 h-px bg-base-content/20' />
                    <span className='text-xs text-base-content/50 uppercase tracking-wider'>New Game</span>
                    <div className='flex-1 h-px bg-base-content/20' />
                </div>
                <div className='flex gap-2 w-full'>
                    <button className='btn btn-primary flex-1' onClick={optionA.onClick}>
                        {optionA.label}
                    </button>
                    <button className='btn btn-secondary flex-1' onClick={optionB.onClick}>
                        {optionB.label}
                    </button>
                </div>
            </div>
        </div>
    );
}
