import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test-utils';
import Footer from './Footer';

describe('Footer', () => {
    it('renders footer links', () => {
        renderWithProviders(<Footer />);
        expect(screen.getByText('Home')).toBeInTheDocument();
        expect(screen.getByText('Games')).toBeInTheDocument();
        expect(screen.getByText('About')).toBeInTheDocument();
    });

    it('renders copyright text', () => {
        renderWithProviders(<Footer />);
        const year = new Date().getFullYear();
        expect(screen.getByText(new RegExp(`${year}`))).toBeInTheDocument();
    });
});
