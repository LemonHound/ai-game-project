import { useEffect, useRef, useState } from 'react';

interface Connect4BoardProps {
    board: ('player' | 'ai' | null)[][];
    playerStarts: boolean;
    currentTurn: 'player' | 'ai' | null;
    locked: boolean;
    winningCells: [number, number][] | null;
    lastDrop: [number, number] | null;
    onColumnClick: (col: number) => void;
    hidePieces?: boolean;
}

/**
 * Renders the interactive Connect 4 board with column drop targeting and winning-cell highlights.
 */
export default function Connect4Board({
    board,
    playerStarts,
    currentTurn,
    locked,
    winningCells,
    lastDrop,
    onColumnClick,
    hidePieces = false,
}: Connect4BoardProps) {
    const playerColor = playerStarts ? 'red' : 'yellow';
    const aiColor = playerStarts ? 'yellow' : 'red';

    const prevBoardRef = useRef<('player' | 'ai' | null)[][] | null>(null);
    const newCellRef = useRef<string | null>(null);
    const [hoveredCol, setHoveredCol] = useState<number | null>(null);

    useEffect(() => {
        if (!prevBoardRef.current) {
            prevBoardRef.current = board;
            return;
        }
        for (let r = 0; r < 6; r++) {
            for (let c = 0; c < 7; c++) {
                if (prevBoardRef.current[r][c] === null && board[r][c] !== null) {
                    newCellRef.current = `${r}-${c}`;
                }
            }
        }
        prevBoardRef.current = board;
    }, [board]);

    const isInteractive = !locked && currentTurn === 'player';

    function isColumnFull(col: number): boolean {
        return board[0][col] !== null;
    }

    function getLandingRow(col: number): number {
        for (let r = 5; r >= 0; r--) {
            if (board[r][col] === null) return r;
        }
        return -1;
    }

    function getPlayerDiscClass(owner: 'player' | 'ai'): string {
        const color = owner === 'player' ? playerColor : aiColor;
        return color === 'red' ? 'bg-red-500' : 'bg-yellow-400';
    }

    function getPreviewClass(): string {
        return playerColor === 'red' ? 'bg-red-400/50' : 'bg-yellow-300/50';
    }

    function isWinningCell(row: number, col: number): boolean {
        if (!winningCells) return false;
        return winningCells.some(([r, c]) => r === row && c === col);
    }

    function hasAnyWinner(): boolean {
        return winningCells !== null && winningCells.length > 0;
    }

    const landingRow =
        hoveredCol !== null && isInteractive && !isColumnFull(hoveredCol) ? getLandingRow(hoveredCol) : -1;

    return (
        <div
            className='w-full max-w-sm mx-auto select-none'
            aria-label='Connect 4 board'
            onMouseLeave={() => setHoveredCol(null)}>
            <div className='grid grid-cols-7 mb-1'>
                {Array.from({ length: 7 }, (_, col) => {
                    const full = isColumnFull(col);
                    const clickable = isInteractive && !full;
                    return (
                        <button
                            key={col}
                            aria-label={`Column ${col + 1}${full ? ', full' : ''}`}
                            disabled={!clickable}
                            onClick={() => clickable && onColumnClick(col)}
                            onMouseEnter={() => setHoveredCol(col)}
                            className={[
                                'h-6 flex items-center justify-center text-xs',
                                clickable
                                    ? 'cursor-pointer text-base-content/50 hover:text-base-content'
                                    : full && isInteractive
                                      ? 'cursor-not-allowed text-base-content/20'
                                      : 'cursor-default text-transparent',
                            ]
                                .filter(Boolean)
                                .join(' ')}>
                            {clickable ? '▼' : full && isInteractive ? '—' : '▼'}
                        </button>
                    );
                })}
            </div>

            <div className='bg-blue-700 rounded-lg p-2'>
                <div className='grid grid-cols-7 gap-1'>
                    {board.map((rowArr, rowIdx) =>
                        rowArr.map((cell, colIdx) => {
                            const winning = isWinningCell(rowIdx, colIdx);
                            const dimmed = hasAnyWinner() && !winning && cell !== null;
                            const isNew = newCellRef.current === `${rowIdx}-${colIdx}`;
                            const isLastDrop =
                                !winning && lastDrop !== null && lastDrop[0] === rowIdx && lastDrop[1] === colIdx;
                            const isPreview = cell === null && rowIdx === landingRow && colIdx === hoveredCol;
                            const full = isColumnFull(colIdx);
                            const cellClickable = isInteractive && !full;

                            let discClass = '';
                            if (cell) {
                                discClass = getPlayerDiscClass(cell);
                            }

                            return (
                                <div
                                    key={`${rowIdx}-${colIdx}`}
                                    className='aspect-square rounded-full bg-blue-900 flex items-center justify-center p-0.5'
                                    style={{ cursor: cellClickable ? 'pointer' : 'default' }}
                                    onMouseEnter={() => setHoveredCol(colIdx)}
                                    onClick={() => cellClickable && onColumnClick(colIdx)}>
                                    <div
                                        className={[
                                            'w-full aspect-square rounded-full transition-all duration-200',
                                            !hidePieces && cell
                                                ? discClass
                                                : !hidePieces && isPreview
                                                  ? getPreviewClass()
                                                  : 'border-2 border-base-content/20',
                                            !hidePieces && winning ? 'animate-pulse' : '',
                                            !hidePieces && dimmed ? 'opacity-40' : '',
                                            !hidePieces && isNew && !winning ? 'scale-95' : '',
                                            !hidePieces && isLastDrop
                                                ? 'ring-2 ring-white/60 ring-offset-1 ring-offset-blue-700'
                                                : '',
                                        ]
                                            .filter(Boolean)
                                            .join(' ')}
                                    />
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
