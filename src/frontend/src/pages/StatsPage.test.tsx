import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test-utils';
import StatsPage from './StatsPage';

describe('StatsPage', () => {
    it('stats page renders table rows', async () => {
        renderWithProviders(<StatsPage />);
        await waitFor(() => {
            expect(screen.getByText('Alice')).toBeInTheDocument();
            expect(screen.getByText('Bob')).toBeInTheDocument();
            expect(screen.getByText('Charlie')).toBeInTheDocument();
        });
    });

    it('renders stats heading', () => {
        renderWithProviders(<StatsPage />);
        expect(screen.getByRole('heading', { name: /^stats$/i })).toBeInTheDocument();
    });
});
