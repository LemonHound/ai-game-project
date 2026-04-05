import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test-utils';
import GameStatsPanel from './GameStatsPanel';

describe('GameStatsPanel', () => {
    it('game stats panel renders zero stats', async () => {
        renderWithProviders(<GameStatsPanel gameType='chess' />);
        await waitFor(() => {
            expect(screen.queryByText('Your Stats')).not.toBeInTheDocument();
        });
    });

    it('renders stats from API', async () => {
        renderWithProviders(<GameStatsPanel gameType='tic_tac_toe' />);
        await waitFor(() => {
            expect(screen.getByText('Your Stats')).toBeInTheDocument();
        });
        expect(screen.getByText('10')).toBeInTheDocument();
        expect(screen.getByText('60%')).toBeInTheDocument();
    });
});
