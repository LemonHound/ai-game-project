import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../../test-utils';
import GameSummaryCard from './GameSummaryCard';

const baseGame = {
    id: 'chess',
    name: 'Chess',
    description: 'A strategy game',
    icon: '♟️',
    difficulty: 'Hard',
    players: 1,
    status: 'active',
    category: 'strategy',
    tags: ['Strategy'],
    game_shell_ready: true,
    ai_model_integrated: false,
};

describe('GameSummaryCard', () => {
    it('shows no trained AI when model is not integrated', () => {
        renderWithProviders(<GameSummaryCard game={baseGame} />);
        expect(screen.getByText(/no trained ai yet/i)).toBeInTheDocument();
        expect(screen.getByText(/ai difficulty: hard/i)).toBeInTheDocument();
    });

    it('shows not available when shell is not ready', () => {
        renderWithProviders(<GameSummaryCard game={{ ...baseGame, id: 'pong', game_shell_ready: false }} />);
        expect(screen.getByText(/not available yet/i)).toBeInTheDocument();
    });
});
