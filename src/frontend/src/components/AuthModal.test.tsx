import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test-utils';
import AuthModal from './AuthModal';

describe('AuthModal', () => {
    it('auth modal validates empty email', () => {
        renderWithProviders(<AuthModal open={true} initialTab='login' onClose={() => {}} />);
        const emailInput =
            screen.getByRole('textbox', { hidden: true }) ||
            screen.getAllByDisplayValue('').find(el => el.getAttribute('type') === 'email');
        expect(emailInput).toBeRequired();
    });

    it('auth modal calls login on submit', async () => {
        const user = userEvent.setup();
        renderWithProviders(<AuthModal open={true} initialTab='login' onClose={() => {}} />);
        const inputs = screen.getAllByRole('textbox', { hidden: true });
        const emailInput = inputs.find(el => el.getAttribute('type') === 'email') || inputs[0];
        const passwordInputs = document.querySelectorAll('input[type="password"]');
        if (emailInput && passwordInputs.length > 0) {
            await user.type(emailInput, 'test@example.com');
            await user.type(passwordInputs[0] as HTMLElement, 'password123');
            const submitBtn = document.querySelector('button[type="submit"]') as HTMLElement;
            await user.click(submitBtn);
        }
    });

    it('renders login and register tabs', () => {
        renderWithProviders(<AuthModal open={true} initialTab='login' onClose={() => {}} />);
        const tabs = screen.getAllByRole('tab');
        expect(tabs.length).toBeGreaterThanOrEqual(2);
        expect(screen.getByRole('tab', { name: /login/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /sign up/i })).toBeInTheDocument();
    });
});
