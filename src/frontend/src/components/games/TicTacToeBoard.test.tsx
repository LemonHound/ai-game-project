import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import TicTacToeBoard from './TicTacToeBoard';

describe('TicTacToeBoard', () => {
    const emptyBoard = Array(9).fill(null);

    it('ttt board click calls move handler', async () => {
        const user = userEvent.setup();
        const onCellClick = vi.fn();
        render(
            <TicTacToeBoard
                board={emptyBoard}
                winningPositions={null}
                lastPosition={null}
                locked={false}
                onCellClick={onCellClick}
            />,
        );
        const cells = screen.getAllByRole('button');
        await user.click(cells[4]);
        expect(onCellClick).toHaveBeenCalledWith(4);
    });

    it('ttt board occupied cell not clickable', async () => {
        const user = userEvent.setup();
        const onCellClick = vi.fn();
        const board = [...emptyBoard];
        board[4] = 'X';
        render(
            <TicTacToeBoard
                board={board}
                winningPositions={null}
                lastPosition={null}
                locked={false}
                onCellClick={onCellClick}
            />,
        );
        const cells = screen.getAllByRole('button');
        await user.click(cells[4]);
        expect(onCellClick).not.toHaveBeenCalled();
    });

    it('renders pieces on board', () => {
        const board = ['X', 'O', null, null, 'X', null, null, null, 'O'];
        render(
            <TicTacToeBoard
                board={board}
                winningPositions={null}
                lastPosition={null}
                locked={false}
                onCellClick={() => {}}
            />,
        );
        expect(screen.getAllByText('X')).toHaveLength(2);
        expect(screen.getAllByText('O')).toHaveLength(2);
    });

    it('locked board does not respond to clicks', async () => {
        const user = userEvent.setup();
        const onCellClick = vi.fn();
        render(
            <TicTacToeBoard
                board={emptyBoard}
                winningPositions={null}
                lastPosition={null}
                locked={true}
                onCellClick={onCellClick}
            />,
        );
        const cells = screen.getAllByRole('button');
        await user.click(cells[0]);
        expect(onCellClick).not.toHaveBeenCalled();
    });
});
