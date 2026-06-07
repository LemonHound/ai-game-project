import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ChessBoard from './ChessBoard';

function makeInitialBoard(): (string | null)[][] {
    const board: (string | null)[][] = Array.from({ length: 8 }, () => Array(8).fill(null));
    board[0] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    board[1] = Array(8).fill('p');
    board[6] = Array(8).fill('P');
    board[7] = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
    return board;
}

describe('ChessBoard', () => {
    const defaultProps = {
        board: makeInitialBoard(),
        playerColor: 'white' as const,
        selectedSquare: null,
        legalDestinations: [] as [number, number][],
        lastMove: null,
        inCheck: false,
        locked: false,
        onSquareClick: vi.fn(),
        onSquareDrop: vi.fn(),
    };

    it('chess board click calls onSquareClick', async () => {
        const user = userEvent.setup();
        const onSquareClick = vi.fn();
        const { container } = render(<ChessBoard {...defaultProps} onSquareClick={onSquareClick} />);
        const squares = container.querySelectorAll('[data-square]');
        expect(squares.length).toBeGreaterThanOrEqual(64);
        await user.click(squares[0]);
        expect(onSquareClick).toHaveBeenCalled();
    });

    it('chess board click target calls move handler', async () => {
        const user = userEvent.setup();
        const onSquareClick = vi.fn();
        const { container } = render(
            <ChessBoard
                {...defaultProps}
                selectedSquare={[6, 4]}
                legalDestinations={[[4, 4]]}
                onSquareClick={onSquareClick}
            />
        );
        const squares = container.querySelectorAll('[data-square]');
        await user.click(squares[0]);
        expect(onSquareClick).toHaveBeenCalled();
    });

    it('lets the player click an empty destination square to move, not just drag', async () => {
        const user = userEvent.setup();
        const onSquareClick = vi.fn();
        const { container } = render(
            <ChessBoard
                {...defaultProps}
                selectedSquare={[6, 4]}
                legalDestinations={[[4, 4]]}
                onSquareClick={onSquareClick}
            />
        );
        const squares = container.querySelectorAll('[data-square]');
        await user.click(squares[36]);
        expect(onSquareClick).toHaveBeenCalledWith(4, 4);
    });

    it('highlights king-from, king-to and rook-to squares for a castling last move', () => {
        const { container } = render(
            <ChessBoard {...defaultProps} lastMove={{ fromRow: 7, fromCol: 4, toRow: 7, toCol: 6, isCastling: true }} />
        );
        const squares = container.querySelectorAll('[data-square]');
        expect(squares[60].className).toContain('yellow');
        expect(squares[62].className).toContain('yellow');
        expect(squares[61].className).toContain('yellow');
        expect(squares[63].className).not.toContain('yellow');
    });

    it('renders board structure', () => {
        const { container } = render(<ChessBoard {...defaultProps} />);
        expect(container.querySelectorAll('[data-square]').length).toBe(64);
    });

    it('renders piece images not letters', () => {
        const { container } = render(<ChessBoard {...defaultProps} />);
        const imgs = container.querySelectorAll('img[src*="/images/"]');
        expect(imgs.length).toBeGreaterThan(0);
        const pieceLetters = container.querySelectorAll('[class*="piece-letter"]');
        expect(pieceLetters.length).toBe(0);
    });

    it('flips board for black player', () => {
        const { container: whiteContainer } = render(<ChessBoard {...defaultProps} playerColor='white' />);
        const { container: blackContainer } = render(<ChessBoard {...defaultProps} playerColor='black' />);
        const whiteSquares = whiteContainer.querySelectorAll('[data-square]');
        const blackSquares = blackContainer.querySelectorAll('[data-square]');
        expect(whiteSquares.length).toBeGreaterThanOrEqual(64);
        expect(blackSquares.length).toBeGreaterThanOrEqual(64);
        const whiteFirstImg = whiteContainer.querySelector('img');
        const blackFirstImg = blackContainer.querySelector('img');
        expect(whiteFirstImg?.getAttribute('alt')).not.toBe(blackFirstImg?.getAttribute('alt'));
    });
});
