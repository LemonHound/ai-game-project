import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import EvalBar from './EvalBar';

describe('EvalBar', () => {
    it('fills ~50% at an even score', () => {
        render(<EvalBar cp={0} mate={null} perspective='white' />);
        expect(screen.getByTestId('eval-bar-white').style.height).toBe('50%');
    });

    it('fills fully for White on mate and shows the mate label', () => {
        render(<EvalBar cp={null} mate={3} perspective='white' />);
        expect(screen.getByTestId('eval-bar-white').style.height).toBe('100%');
        expect(screen.getByText('M3')).toBeTruthy();
    });

    it('flips fill direction with perspective', () => {
        const { rerender } = render(<EvalBar cp={200} mate={null} perspective='white' />);
        expect(screen.getByTestId('eval-bar').style.flexDirection).toBe('column-reverse');
        rerender(<EvalBar cp={200} mate={null} perspective='black' />);
        expect(screen.getByTestId('eval-bar').style.flexDirection).toBe('column');
    });

    it('shows a positive pawn label', () => {
        render(<EvalBar cp={140} mate={null} perspective='white' />);
        expect(screen.getByText('+1.4')).toBeTruthy();
    });
});
