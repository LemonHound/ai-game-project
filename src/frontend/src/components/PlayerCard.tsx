interface PlayerCardProps {
    name: string;
    avatarUrl?: string;
    isAi?: boolean;
    symbol?: string;
    statusText?: string;
    result?: 'win' | 'loss' | 'draw' | null;
    captureIcons?: string[];
}

function BotIcon() {
    return (
        <svg
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='1.5'
            strokeLinecap='round'
            strokeLinejoin='round'
            className='w-6 h-6'>
            <rect x='7' y='8' width='10' height='9' rx='2' />
            <circle cx='10' cy='12' r='1' fill='currentColor' stroke='none' />
            <circle cx='14' cy='12' r='1' fill='currentColor' stroke='none' />
            <path d='M10 15h4' />
            <path d='M12 8V5' />
            <circle cx='12' cy='4.5' r='0.75' fill='currentColor' stroke='none' />
            <path d='M7 11H5M17 11h2' />
        </svg>
    );
}

function resultLabel(result: 'win' | 'loss' | 'draw', isAi: boolean): string {
    if (result === 'draw') return 'Draw';
    if (result === 'win') return isAi ? 'Wins!' : 'You Win!';
    return isAi ? 'Loses' : 'You Lose';
}

function resultBadgeClass(result: 'win' | 'loss' | 'draw'): string {
    if (result === 'win') return 'badge-success';
    if (result === 'loss') return 'badge-error';
    return 'badge-warning';
}

export default function PlayerCard({
    name,
    avatarUrl,
    isAi,
    symbol,
    statusText,
    result,
    captureIcons,
}: PlayerCardProps) {
    return (
        <div className='flex items-center gap-3 p-3 bg-base-200 rounded-lg w-full'>
            <div className='shrink-0'>
                {avatarUrl ? (
                    <div className='w-12 h-12 rounded-full overflow-hidden'>
                        <img src={avatarUrl} alt={name} className='w-full h-full object-cover' />
                    </div>
                ) : isAi ? (
                    <div className='w-12 h-12 rounded-full bg-base-300 flex items-center justify-center text-base-content/60'>
                        <BotIcon />
                    </div>
                ) : (
                    <div className='w-12 h-12 rounded-full bg-primary text-primary-content flex items-center justify-center font-bold text-lg select-none'>
                        {name.charAt(0).toUpperCase()}
                    </div>
                )}
            </div>

            <div className='flex-1 min-w-0'>
                <div className='flex items-center gap-2 flex-wrap'>
                    <span className='font-semibold truncate'>{name}</span>
                    {symbol && <span className='badge badge-sm badge-outline'>{symbol}</span>}
                </div>

                {statusText ? (
                    <div className='flex items-center gap-1 mt-0.5 text-sm text-base-content/60'>
                        <span className='loading loading-dots loading-xs' />
                        <span>{statusText}</span>
                    </div>
                ) : result ? (
                    <div className={`badge badge-sm mt-0.5 ${resultBadgeClass(result)}`}>
                        {resultLabel(result, !!isAi)}
                    </div>
                ) : null}

                {captureIcons && captureIcons.length > 0 && (
                    <div className='flex flex-wrap gap-0.5 mt-1'>
                        {captureIcons.map((src, i) => (
                            <img key={i} src={src} alt='' className='w-5 h-5 object-contain' />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
