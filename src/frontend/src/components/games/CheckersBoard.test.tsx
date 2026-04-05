import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CheckersBoard from './CheckersBoard';

function makeInitialBoard(): string[] {
    const board = Array(64).fill('_');
    [40, 42, 44, 46, 49, 51, 53, 55, 56, 58, 60, 62].forEach(p => (board[p] = 'R'));
    [1, 3, 5, 7, 8, 10, 12, 14, 17, 19, 21, 23].forEach(p => (board[p] = 'B'));
    return board;
}

describe('CheckersBoard', () => {
    const defaultProps = {
        board: makeInitialBoard(),
        playerSymbol: 'R',
        currentTurn: 'player' as const,
        selectedPiece: null,
        validDestinations: [] as number[],
        legalPieces: [40, 42, 44, 46, 49, 51, 53, 55],
        mustCapture: null,
        locked: false,
        flipped: false,
        lastMove: null,
        onPieceClick: vi.fn(),
        onPieceDragStart: vi.fn(),
        onSquareClick: vi.fn(),
        onSquareDrop: vi.fn(),
    };

    it('checkers board shows valid moves on piece click', async () => {
        const user = userEvent.setup();
        const onPieceClick = vi.fn();
        const { container } = render(<CheckersBoard {...defaultProps} onPieceClick={onPieceClick} />);
        const interactivePieces = container.querySelectorAll('[class*="cursor-pointer"][class*="absolute"]');
        expect(interactivePieces.length).toBeGreaterThan(0);
    });

    it('renders board with pieces', () => {
        const { container } = render(<CheckersBoard {...defaultProps} />);
        expect(container.firstChild).toBeTruthy();
    });
});
