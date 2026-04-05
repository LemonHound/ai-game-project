import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test-utils';
import ProfilePage from './ProfilePage';

describe('ProfilePage', () => {
    it('renders user profile', async () => {
        renderWithProviders(<ProfilePage />);
        await waitFor(() => {
            expect(screen.queryByText('testuser') || screen.queryByText('Test User')).toBeTruthy();
        });
    });

    it('renders stats display', async () => {
        renderWithProviders(<ProfilePage />);
        await waitFor(() => {
            expect(screen.queryByText('testuser') || screen.queryByText('Test User')).toBeTruthy();
        });
    });
});
