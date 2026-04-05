import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test-utils';
import HomePage from './HomePage';

describe('HomePage', () => {
    it('renders hero section', () => {
        renderWithProviders(<HomePage />);
        expect(screen.getByText('AI Game Hub')).toBeInTheDocument();
    });

    it('home page game cards link to correct routes', () => {
        renderWithProviders(<HomePage />);
        const browseLink = screen.getByText(/browse games/i);
        expect(browseLink.closest('a')).toHaveAttribute('href', '/games');
    });
});
