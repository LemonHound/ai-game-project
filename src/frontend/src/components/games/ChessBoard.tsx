interface ChessBoardProps {
    board: (string | null)[][];
    playerColor: 'white' | 'black';
    selectedSquare: [number, number] | null;
    legalDestinations: [number, number][];
    lastMove: { fromRow: number; fromCol: number; toRow: number; toCol: number } | null;
    inCheck: boolean;
    locked: boolean;
    onSquareClick: (row: number, col: number) => void;
    kingInCheckColor?: 'white' | 'black' | null;
    kingPositions?: { white: [number, number]; black: [number, number] } | null;
}

const PIECE_IMAGES: Record<string, string> = {
    K: '/images/k_white.png',
    Q: '/images/q_white.png',
    R: '/images/r_white.png',
    B: '/images/b_white.png',
    N: '/images/n_white.png',
    P: '/images/p_white.png',
    k: '/images/k_black.png',
    q: '/images/q_black.png',
    r: '/images/r_black.png',
    b: '/images/b_black.png',
    n: '/images/n_black.png',
    p: '/images/p_black.png',
};

export default function ChessBoard({
    board,
    playerColor,
    selectedSquare,
    legalDestinations,
    lastMove,
    inCheck,
    locked,
    onSquareClick,
    kingInCheckColor,
    kingPositions,
}: ChessBoardProps) {
    const rows = playerColor === 'black' ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
    const cols = playerColor === 'black' ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

    const isSelected = (r: number, c: number) =>
        selectedSquare !== null && selectedSquare[0] === r && selectedSquare[1] === c;

    const isLegalDest = (r: number, c: number) => legalDestinations.some(([lr, lc]) => lr === r && lc === c);

    const isLastMove = (r: number, c: number) =>
        lastMove !== null &&
        ((lastMove.fromRow === r && lastMove.fromCol === c) || (lastMove.toRow === r && lastMove.toCol === c));

    const isKingInCheck = (r: number, c: number) => {
        if (!inCheck || !kingInCheckColor || !kingPositions) return false;
        const kp = kingPositions[kingInCheckColor];
        return kp[0] === r && kp[1] === c;
    };

    const getSquareBg = (r: number, c: number) => {
        const isLight = (r + c) % 2 === 0;
        if (isKingInCheck(r, c)) return 'bg-red-500';
        if (isSelected(r, c)) return 'bg-yellow-300';
        if (isLastMove(r, c)) return isLight ? 'bg-yellow-100' : 'bg-yellow-600';
        return isLight ? 'bg-amber-100' : 'bg-amber-800';
    };

    return (
        <div className='inline-block border-2 border-amber-900 rounded'>
            {rows.map(r => (
                <div key={r} className='flex'>
                    {cols.map(c => {
                        const piece = board[r][c];
                        const imgSrc = piece ? PIECE_IMAGES[piece] : null;

                        return (
                            <div
                                key={c}
                                className={`relative flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 cursor-pointer select-none ${getSquareBg(r, c)} ${!locked ? 'hover:opacity-90' : ''}`}
                                onClick={() => !locked && onSquareClick(r, c)}>
                                {isLegalDest(r, c) && (
                                    <div
                                        className={`absolute rounded-full z-10 ${piece ? 'inset-0 border-4 border-black/30' : 'w-3 h-3 bg-black/30'}`}
                                    />
                                )}
                                {imgSrc && (
                                    <img
                                        src={imgSrc}
                                        alt={piece ?? ''}
                                        className='w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 z-20 object-contain drop-shadow-md pointer-events-none'
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}
