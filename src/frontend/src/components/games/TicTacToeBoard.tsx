interface TicTacToeBoardProps {
    board: (string | null)[];
    winningPositions: number[] | null;
    lastPosition: number | null;
    locked: boolean;
    onCellClick: (index: number) => void;
    hidePieces?: boolean;
}

export default function TicTacToeBoard({ board, winningPositions, lastPosition, locked, onCellClick, hidePieces = false }: TicTacToeBoardProps) {
    return (
        <div className='grid grid-cols-3 gap-2 w-full max-w-xs sm:max-w-sm mx-auto' aria-label='Tic-Tac-Toe board'>
            {board.map((cell, index) => {
                const isWinning = winningPositions?.includes(index) ?? false;
                const isLast = !isWinning && lastPosition === index && cell !== null;
                const isEmpty = cell === null;
                const isClickable = isEmpty && !locked;

                return (
                    <button
                        key={index}
                        aria-label={`Cell ${index + 1}${cell ? `, ${cell}` : ', empty'}`}
                        disabled={!isClickable}
                        onClick={() => isClickable && onCellClick(index)}
                        className={[
                            'aspect-square min-h-[64px] flex items-center justify-center',
                            'text-4xl font-bold rounded-lg border-2 transition-colors',
                            isWinning
                                ? 'border-primary bg-primary/20'
                                : isLast
                                  ? 'border-base-content/40 bg-base-content/10'
                                  : 'border-base-300 bg-base-200',
                            isClickable ? 'hover:bg-base-300 cursor-pointer' : 'cursor-not-allowed opacity-70',
                        ]
                            .filter(Boolean)
                            .join(' ')}>
                        <span className={cell === 'X' ? 'text-primary' : cell === 'O' ? 'text-secondary' : ''}>
                            {hidePieces ? '' : (cell ?? '')}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
