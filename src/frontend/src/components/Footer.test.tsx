import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test-utils';
import Footer from './Footer';

describe('Footer', () => {
    it('renders copyright without duplicate nav links', () => {
        renderWithProviders(<Footer />);
        expect(screen.queryByRole('link', { name: 'Home' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Games' })).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'About' })).not.toBeInTheDocument();
    });

    it('renders copyright text', () => {
        renderWithProviders(<Footer />);
        const year = new Date().getFullYear();
        expect(screen.getByText(new RegExp(`${year}`))).toBeInTheDocument();
    });
});
