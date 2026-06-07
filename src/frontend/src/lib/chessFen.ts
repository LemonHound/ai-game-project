const FILES = 'abcdefgh';

export interface CastlingRights {
    white: { kingside: boolean; queenside: boolean };
    black: { kingside: boolean; queenside: boolean };
}

export const boardToFen = (
    board: (string | null)[][],
    side: 'w' | 'b',
    castling: CastlingRights,
    enPassant: [number, number] | null
): string => {
    const ranks = board.map(row => {
        let str = '';
        let empty = 0;
        for (const cell of row) {
            if (cell === null) {
                empty += 1;
            } else {
                if (empty) {
                    str += String(empty);
                    empty = 0;
                }
                str += cell;
            }
        }
        if (empty) str += String(empty);
        return str;
    });
    let rights = '';
    if (castling.white.kingside) rights += 'K';
    if (castling.white.queenside) rights += 'Q';
    if (castling.black.kingside) rights += 'k';
    if (castling.black.queenside) rights += 'q';
    if (!rights) rights = '-';
    const ep = enPassant ? `${FILES[enPassant[1]]}${8 - enPassant[0]}` : '-';
    return `${ranks.join('/')} ${side} ${rights} ${ep} 0 1`;
};
