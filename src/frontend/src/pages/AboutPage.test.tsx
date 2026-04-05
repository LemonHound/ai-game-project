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
});
