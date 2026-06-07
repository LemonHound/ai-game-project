import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test-utils';
import ProfilePage from './ProfilePage';

describe('ProfilePage', () => {
    it('renders the display name', async () => {
        renderWithProviders(<ProfilePage />);
        await waitFor(() => {
            expect(screen.getByText('Test User')).toBeInTheDocument();
        });
    });

    it('does not expose the email as a public @handle', async () => {
        renderWithProviders(<ProfilePage />);
        await waitFor(() => {
            expect(screen.getByText('Test User')).toBeInTheDocument();
        });
        expect(screen.queryByText('@test@example.com')).toBeNull();
        expect(screen.queryByText('@testuser')).toBeNull();
    });
});
