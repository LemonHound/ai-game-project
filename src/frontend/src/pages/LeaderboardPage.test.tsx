import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test-utils';
import LeaderboardPage from './LeaderboardPage';

describe('LeaderboardPage', () => {
    it('leaderboard page renders table rows', async () => {
        renderWithProviders(<LeaderboardPage />);
        await waitFor(() => {
            expect(screen.getByText('Alice')).toBeInTheDocument();
            expect(screen.getByText('Bob')).toBeInTheDocument();
            expect(screen.getByText('Charlie')).toBeInTheDocument();
        });
    });

    it('renders leaderboard heading', () => {
        renderWithProviders(<LeaderboardPage />);
        expect(screen.getByText(/leaderboard/i)).toBeInTheDocument();
    });
});
