import { describe, expect, it } from 'vitest';
import { boardToFen, type CastlingRights } from './chessFen';

const FULL: CastlingRights = {
    white: { kingside: true, queenside: true },
    black: { kingside: true, queenside: true },
};

function startBoard(): (string | null)[][] {
    const board: (string | null)[][] = Array.from({ length: 8 }, () => Array(8).fill(null));
    board[0] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    board[1] = Array(8).fill('p');
    board[6] = Array(8).fill('P');
    board[7] = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
    return board;
}

describe('boardToFen', () => {
    it('serializes the starting position', () => {
        expect(boardToFen(startBoard(), 'w', FULL, null)).toBe(
            'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
        );
    });

    it('serializes side to move and the en passant square after a double pawn push', () => {
        const board = startBoard();
        board[6][4] = null;
        board[4][4] = 'P';
        expect(boardToFen(board, 'b', FULL, [5, 4])).toBe(
            'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'
        );
    });

    it('serializes partial castling rights and a dash when none remain', () => {
        const board = startBoard();
        expect(
            boardToFen(
                board,
                'w',
                { white: { kingside: true, queenside: false }, black: { kingside: false, queenside: true } },
                null
            )
        ).toContain(' w Kq - ');
        expect(
            boardToFen(
                board,
                'b',
                { white: { kingside: false, queenside: false }, black: { kingside: false, queenside: false } },
                null
            )
        ).toContain(' b - - ');
    });
});
