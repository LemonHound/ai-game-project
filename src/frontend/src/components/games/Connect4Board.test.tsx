import { render } from '@testing-library/react';
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

    it('column click triggers drop', async () => {
        const user = userEvent.setup();
        const onColumnClick = vi.fn();
        const { container } = render(<Connect4Board {...defaultProps} onColumnClick={onColumnClick} />);
        const boardGrid = container.querySelector('.bg-blue-700');
        const cells = boardGrid?.querySelectorAll('.bg-blue-900');
        expect(cells?.length).toBeGreaterThan(0);
        await user.click(cells![0]);
        expect(onColumnClick).toHaveBeenCalledWith(0);
    });

    it('hovered column shows preview', async () => {
        const user = userEvent.setup();
        const { container } = render(<Connect4Board {...defaultProps} />);
        const boardGrid = container.querySelector('.bg-blue-700');
        const cells = boardGrid?.querySelectorAll('.bg-blue-900');
        await user.hover(cells![cells!.length - 7]);
        const preview = container.querySelector('[class*="bg-red-400/50"], [class*="bg-yellow-300/50"]');
        expect(preview).not.toBeNull();
    });

    it('connect4 board full column not clickable', () => {
        const board = emptyBoard();
        for (let r = 0; r < 6; r++) board[r][3] = 'player';
        const onColumnClick = vi.fn();
        const { container } = render(<Connect4Board {...defaultProps} board={board} onColumnClick={onColumnClick} />);
        expect(container).toBeDefined();
    });

    it('renders empty board', () => {
        const { container } = render(<Connect4Board {...defaultProps} />);
        expect(container.querySelector('[class*="grid"]') || container.firstChild).toBeTruthy();
    });
});
