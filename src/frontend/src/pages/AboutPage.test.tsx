import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test-utils';
import AboutPage from './AboutPage';

describe('AboutPage', () => {
    it('renders stats section', async () => {
        renderWithProviders(<AboutPage />);
        await waitFor(() => {
            expect(screen.getByText(/games played/i)).toBeInTheDocument();
        });
    });

    it('renders team section', async () => {
        renderWithProviders(<AboutPage />);
        await waitFor(() => {
            expect(screen.getByText(/team/i)).toBeInTheDocument();
        });
    });

    it('renders_team_member_names', async () => {
        renderWithProviders(<AboutPage />);
        await waitFor(() => {
            expect(screen.getByText(/kevin zookski/i)).toBeInTheDocument();
            expect(screen.getByText(/brian waskevich/i)).toBeInTheDocument();
        });
    });

    it('renders_eight_stat_cards', async () => {
        renderWithProviders(<AboutPage />);
        await waitFor(() => {
            expect(screen.getByText(/games played/i)).toBeInTheDocument();
            expect(screen.getByText(/moves analyzed/i)).toBeInTheDocument();
            expect(screen.getByText(/registered players/i)).toBeInTheDocument();
            expect(screen.getByText(/active players/i)).toBeInTheDocument();
            expect(screen.getByText(/ai win rate/i)).toBeInTheDocument();
            expect(screen.getByText(/player win rate/i)).toBeInTheDocument();
            expect(screen.getByText(/avg\. moves\/game/i)).toBeInTheDocument();
            expect(screen.getByText(/days running/i)).toBeInTheDocument();
        });
    });

    it('renders_donation_buttons', async () => {
        renderWithProviders(<AboutPage />);
        await waitFor(() => {
            expect(screen.getByRole('link', { name: /buy us a coffee/i })).toBeInTheDocument();
            expect(screen.getByRole('link', { name: /support on patreon/i })).toBeInTheDocument();
        });
    });

    it('renders_cost_line', async () => {
        renderWithProviders(<AboutPage />);
        await waitFor(() => {
            expect(screen.getByText(/\$20\/month/i)).toBeInTheDocument();
        });
    });
});
