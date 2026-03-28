import { useState } from 'react';

interface NewGameButtonsProps {
    optionA: { label: string; onClick: () => void };
    optionB: { label: string; onClick: () => void };
    onResign?: () => void;
    className?: string;
}

export default function NewGameButtons({ optionA, optionB, onResign, className }: NewGameButtonsProps) {
    const [expanded, setExpanded] = useState(false);

    const handleOptionClick = (onClick: () => void) => {
        setExpanded(false);
        onClick();
    };

    return (
        <div className={className}>
            {expanded ? (
                <div className='flex gap-2 flex-wrap items-center justify-center'>
                    <button className='btn btn-primary btn-sm' onClick={() => handleOptionClick(optionA.onClick)}>
                        {optionA.label}
                    </button>
                    <button className='btn btn-secondary btn-sm' onClick={() => handleOptionClick(optionB.onClick)}>
                        {optionB.label}
                    </button>
                    <button className='btn btn-ghost btn-sm btn-square text-base' onClick={() => setExpanded(false)}>
                        ✕
                    </button>
                </div>
            ) : (
                <div className='flex gap-2 items-center justify-center'>
                    <button className='btn btn-neutral btn-sm' onClick={() => setExpanded(true)}>
                        New Game
                    </button>
                    {onResign && (
                        <button className='btn btn-error btn-outline btn-sm' onClick={onResign}>
                            Resign
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
