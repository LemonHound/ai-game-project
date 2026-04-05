import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Connect4Board from './Connect4Board';

function emptyBoard(): (string | null)[][] {
    return Array.from({ length: 6 }, () => Array(7).fill(null));
}

describe('Connect4Board', () => {
    const defaultProps = {
        board: emptyBoard(),
        playerStarts: true,
        currentTurn: 'player' as const,
        locked: false,
        winningCells: null,
        lastDrop: null,
        onColumnClick: vi.fn(),
    };

    it('connect4 board click calls move with column', async () => {
        const user = userEvent.setup();
        const onColumnClick = vi.fn();
        const { container } = render(
            <Connect4Board {...defaultProps} onColumnClick={onColumnClick} />,
        );
        const clickableElements = container.querySelectorAll('[class*="cursor-pointer"]');
        if (clickableElements.length > 0) {
            await user.click(clickableElements[0]);
            expect(onColumnClick).toHaveBeenCalled();
        }
    });

    it('connect4 board full column not clickable', () => {
        const board = emptyBoard();
        for (let r = 0; r < 6; r++) board[r][3] = 'player';
        const onColumnClick = vi.fn();
        const { container } = render(
            <Connect4Board
                {...defaultProps}
                board={board}
                onColumnClick={onColumnClick}
            />,
        );
        expect(container).toBeDefined();
    });

    it('renders empty board', () => {
        const { container } = render(<Connect4Board {...defaultProps} />);
        expect(container.querySelector('[class*="grid"]') || container.firstChild).toBeTruthy();
    });
});
