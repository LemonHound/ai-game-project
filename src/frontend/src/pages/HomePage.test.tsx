import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test-utils';
import HomePage from './HomePage';

describe('HomePage', () => {
    it('renders hero section', () => {
        renderWithProviders(<HomePage />);
        expect(screen.getByText('AI Game Hub')).toBeInTheDocument();
    });

    it('home page links to games and stats', () => {
        renderWithProviders(<HomePage />);
        expect(screen.getByRole('link', { name: /^all games$/i })).toHaveAttribute('href', '/games');
        expect(screen.getByRole('link', { name: /^public stats$/i })).toHaveAttribute('href', '/stats');
    });
});
