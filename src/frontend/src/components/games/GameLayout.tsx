import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface GameLayoutProps {
    aspect?: number;
    board: ReactNode;
    opponent: ReactNode;
    player: ReactNode;
    controls: ReactNode;
}

function GameFooter() {
    return (
        <div className='flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-base-content/50'>
            <span>&copy; {new Date().getFullYear()} AI Game Hub</span>
            <Link to='/about' className='link link-hover'>
                About
            </Link>
            <a
                href='https://buymeacoffee.com/aigamehub'
                target='_blank'
                rel='noopener noreferrer'
                className='link link-hover'>
                Support
            </a>
        </div>
    );
}

export default function GameLayout({ aspect = 1, board, opponent, player, controls }: GameLayoutProps) {
    return (
        <div
            className='flex h-full min-h-0 flex-col gap-2 p-2 [container-type:size] lg:flex-row lg:items-stretch lg:justify-center lg:gap-3 lg:p-3'
            style={{ '--board-aspect': String(aspect) } as CSSProperties}>
            <div className='flex shrink-0 items-stretch gap-2 lg:w-44 lg:flex-col lg:justify-between'>
                <div className='flex min-w-0 flex-1 justify-end lg:flex-none'>{opponent}</div>
                <div className='flex min-w-0 flex-1 justify-end lg:flex-none'>{player}</div>
            </div>

            <div className='game-board-box relative shrink-0 self-center overflow-hidden rounded-lg border-2 border-base-content/20 shadow-lg'>
                {board}
            </div>

            <aside className='flex shrink-0 flex-col gap-2 lg:w-72 lg:max-w-xs'>
                <div className='flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-base-content/10 bg-base-200/40 p-3'>
                    {controls}
                </div>
                <GameFooter />
            </aside>
        </div>
    );
}
