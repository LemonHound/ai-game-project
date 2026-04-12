import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test-utils';
import Footer from './Footer';

describe('Footer', () => {
    it('footer_renders_all_links', () => {
        renderWithProviders(<Footer />);
        expect(screen.getByRole('link', { name: /about/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /support/i })).toBeInTheDocument();
        expect(screen.getByText(/discord/i)).toBeInTheDocument();
    });
});
