import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import GameStartOverlay from './GameStartOverlay';

describe('GameStartOverlay', () => {
    it('displays game options', () => {
        render(
            <GameStartOverlay
                canResume={false}
                onResume={() => {}}
                optionA={{ label: 'Play as White', onClick: () => {} }}
                optionB={{ label: 'Play as Black', onClick: () => {} }}
            />,
        );
        expect(screen.getByText('Play as White')).toBeInTheDocument();
        expect(screen.getByText('Play as Black')).toBeInTheDocument();
    });

    it('game start overlay calls correct callback', async () => {
        const user = userEvent.setup();
        const onClickA = vi.fn();
        render(
            <GameStartOverlay
                canResume={false}
                onResume={() => {}}
                optionA={{ label: 'Player First', onClick: onClickA }}
                optionB={{ label: 'AI First', onClick: () => {} }}
            />,
        );
        await user.click(screen.getByText('Player First'));
        expect(onClickA).toHaveBeenCalledOnce();
    });

    it('continue button disabled when no resume', () => {
        render(
            <GameStartOverlay
                canResume={false}
                onResume={() => {}}
                optionA={{ label: 'A', onClick: () => {} }}
                optionB={{ label: 'B', onClick: () => {} }}
            />,
        );
        const continueBtn = screen.getByText(/continue/i);
        expect(continueBtn).toBeDisabled();
    });
});
