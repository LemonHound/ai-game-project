interface CheckersBoardProps {
    board: string[];
    playerSymbol: string;
    currentTurn: 'player' | 'ai' | null;
    selectedPiece: number | null;
    validDestinations: number[];
    legalPieces: number[];
    mustCapture: number | null;
    locked: boolean;
    flipped: boolean;
    onPieceClick: (pos: number) => void;
    onSquareClick: (pos: number) => void;
}

function PieceDisplay({ code }: { code: string }) {
    const isRed = code === 'R' || code === 'r';
    const isKing = code === 'r' || code === 'b';

    const baseClass = isRed ? 'bg-red-500 border-red-700' : 'bg-neutral-800 border-neutral-600';

    return (
        <div className={`w-3/4 h-3/4 rounded-full border-2 flex items-center justify-center ${baseClass}`}>
            {isKing && <div className='w-1/2 h-1/2 rounded-full bg-white/40 border border-white/60' />}
        </div>
    );
}

export default function CheckersBoard({
    board,
    currentTurn,
    selectedPiece,
    validDestinations,
    legalPieces,
    mustCapture,
    locked,
    flipped,
    onPieceClick,
    onSquareClick,
}: CheckersBoardProps) {
    const rows = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

    return (
        <div
            className='inline-grid border-2 border-neutral-700'
            style={{ gridTemplateColumns: 'repeat(8, 1fr)', width: '100%', maxWidth: '480px' }}
            aria-label='Checkers board'>
            {rows.map(row =>
                [0, 1, 2, 3, 4, 5, 6, 7].map(col => {
                    const pos = row * 8 + col;
                    const isLight = (row + col) % 2 === 0;
                    const piece = board[pos];
                    const hasPiece = piece !== '_' && piece !== undefined;
                    const isSelected = selectedPiece === pos;
                    const isDestination = validDestinations.includes(pos);
                    const isLegalPiece = legalPieces.includes(pos);

                    const isInteractivePiece =
                        !locked &&
                        currentTurn === 'player' &&
                        hasPiece &&
                        (mustCapture !== null ? pos === mustCapture : isLegalPiece);

                    const isNonInteractivePiece =
                        !locked && currentTurn === 'player' && hasPiece && !isInteractivePiece;

                    const isDestinationInteractive = !locked && currentTurn === 'player' && !hasPiece && isDestination;

                    let squareBg = isLight ? 'bg-amber-100' : 'bg-amber-800';
                    if (!isLight && isSelected) squareBg = 'bg-yellow-500';
                    else if (!isLight && isDestination) squareBg = 'bg-green-600/60';

                    return (
                        <div
                            key={pos}
                            className={`relative aspect-square flex items-center justify-center ${squareBg}`}
                            onClick={() => {
                                if (isDestinationInteractive) {
                                    onSquareClick(pos);
                                }
                            }}
                            style={{ cursor: isDestinationInteractive ? 'pointer' : 'default' }}>
                            {isDestination && !hasPiece && (
                                <div className='absolute w-1/3 h-1/3 rounded-full bg-green-400/70 pointer-events-none' />
                            )}
                            {hasPiece && (
                                <div
                                    className={`absolute inset-0 flex items-center justify-center ${isInteractivePiece ? 'cursor-pointer' : 'cursor-default'}`}
                                    onClick={e => {
                                        if (isInteractivePiece) {
                                            e.stopPropagation();
                                            onPieceClick(pos);
                                        }
                                    }}>
                                    <div
                                        className={`w-3/4 h-3/4 flex items-center justify-center transition-all ${isInteractivePiece ? 'hover:scale-110' : ''} ${isSelected ? 'ring-4 ring-yellow-300 rounded-full' : ''} ${isNonInteractivePiece ? 'opacity-35' : ''}`}>
                                        <PieceDisplay code={piece} />
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })
            )}
        </div>
    );
}
