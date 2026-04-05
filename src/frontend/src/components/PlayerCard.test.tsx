import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PlayerCard from './PlayerCard';

describe('PlayerCard', () => {
    it('renders user data', () => {
        render(<PlayerCard name="Alice" symbol="X" />);
        expect(screen.getByText('Alice')).toBeInTheDocument();
    });

    it('handles missing fields', () => {
        render(<PlayerCard name="Bot" isAi={true} />);
        expect(screen.getByText('Bot')).toBeInTheDocument();
    });

    it('shows result badge', () => {
        render(<PlayerCard name="Alice" result="win" />);
        expect(screen.getByText(/win/i)).toBeInTheDocument();
    });
});
