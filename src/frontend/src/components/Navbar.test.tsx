import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test-utils';
import Navbar from './Navbar';

describe('Navbar', () => {
    it('renders navbar with all navigation links', () => {
        renderWithProviders(<Navbar />);
        expect(screen.getAllByText('Home').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('Games').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('About').length).toBeGreaterThanOrEqual(1);
        expect(screen.getAllByText('Stats').length).toBeGreaterThanOrEqual(1);
    });

    it('renders brand link', () => {
        renderWithProviders(<Navbar />);
        expect(screen.getByText('AI Game Hub')).toBeInTheDocument();
    });

    it('highlights active route in navbar', () => {
        renderWithProviders(<Navbar />, { route: '/about' });
        const aboutLinks = screen.getAllByText('About');
        expect(aboutLinks.length).toBeGreaterThanOrEqual(1);
        const hasActiveLink = aboutLinks.some(el => el.closest('a')?.getAttribute('href') === '/about');
        expect(hasActiveLink).toBe(true);
    });
});
