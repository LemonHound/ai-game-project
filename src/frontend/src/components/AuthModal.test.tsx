import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { server } from '../mocks/server';
import { renderWithProviders } from '../test-utils';
import AuthModal from './AuthModal';

describe('AuthModal', () => {
    it('renders login and register tabs', () => {
        renderWithProviders(<AuthModal open initialTab='login' onClose={() => {}} />);
        expect(screen.getByRole('tab', { name: /login/i })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /sign up/i })).toBeInTheDocument();
    });

    it('marks the login email as required', () => {
        renderWithProviders(<AuthModal open initialTab='login' onClose={() => {}} />);
        expect(document.querySelector('#login-email')).toBeRequired();
    });

    it('calls login and closes on submit', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        renderWithProviders(<AuthModal open initialTab='login' onClose={onClose} />);
        await user.type(document.querySelector('#login-email') as HTMLElement, 'test@example.com');
        await user.type(document.querySelector('#login-password') as HTMLElement, 'password123');
        await user.click(screen.getByRole('button', { name: /^login$/i }));
        await waitFor(() => expect(onClose).toHaveBeenCalled());
    });

    it('register form has no username field', () => {
        renderWithProviders(<AuthModal open initialTab='register' onClose={() => {}} />);
        expect(screen.queryByText(/^username$/i)).toBeNull();
        expect(document.querySelector('#register-displayname')).toBeTruthy();
        expect(document.querySelector('#register-email')).toBeTruthy();
        expect(document.querySelector('#register-password')).toBeTruthy();
        expect(document.querySelector('#register-confirm')).toBeTruthy();
    });

    it('gives every register field the same layout classes', () => {
        renderWithProviders(<AuthModal open initialTab='register' onClose={() => {}} />);
        const inputs = Array.from(document.querySelectorAll('input')).filter(input =>
            ['email', 'text', 'password'].includes(input.getAttribute('type') || 'text')
        );
        expect(inputs.length).toBe(4);
        for (const input of inputs) {
            expect(input.classList.contains('input-bordered')).toBe(true);
            expect(input.classList.contains('w-full')).toBe(true);
            expect(input.closest('.form-control.w-full')).not.toBeNull();
        }
    });

    it('lets the user peek a password via the show/hide toggle', async () => {
        const user = userEvent.setup();
        renderWithProviders(<AuthModal open initialTab='register' onClose={() => {}} />);
        const password = document.querySelector('#register-password') as HTMLInputElement;
        const toggle = password.parentElement!.querySelector('button') as HTMLElement;
        expect(password.type).toBe('password');
        expect(toggle).toHaveAttribute('aria-label', 'Show password');
        await user.click(toggle);
        expect(password.type).toBe('text');
        expect(toggle).toHaveAttribute('aria-label', 'Hide password');
        expect(toggle).toHaveAttribute('aria-pressed', 'true');
    });

    it('blocks registration and shows an error when passwords do not match', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        let registerCalled = false;
        server.use(
            http.post('/api/auth/register', () => {
                registerCalled = true;
                return HttpResponse.json({ user: {} });
            })
        );
        renderWithProviders(<AuthModal open initialTab='register' onClose={onClose} />);
        await user.type(document.querySelector('#register-email') as HTMLElement, 'new@example.com');
        await user.type(document.querySelector('#register-password') as HTMLElement, 'abc123');
        await user.type(document.querySelector('#register-confirm') as HTMLElement, 'xyz789');
        await user.click(screen.getByRole('button', { name: /create account/i }));
        expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
        expect(registerCalled).toBe(false);
        expect(onClose).not.toHaveBeenCalled();
    });

    it('registers with email, password and display name only when passwords match', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        let body: Record<string, unknown> | null = null;
        server.use(
            http.post('/api/auth/register', async ({ request }) => {
                body = (await request.json()) as Record<string, unknown>;
                const email = String(body.email);
                return HttpResponse.json({
                    user: {
                        id: 2,
                        username: email,
                        email,
                        displayName: body.displayName || email.split('@')[0],
                        authProvider: 'local',
                        emailVerified: false,
                        statsPublic: true,
                    },
                });
            })
        );
        renderWithProviders(<AuthModal open initialTab='register' onClose={onClose} />);
        await user.type(document.querySelector('#register-displayname') as HTMLElement, 'New Person');
        await user.type(document.querySelector('#register-email') as HTMLElement, 'new@example.com');
        await user.type(document.querySelector('#register-password') as HTMLElement, 'abc123');
        await user.type(document.querySelector('#register-confirm') as HTMLElement, 'abc123');
        await user.click(screen.getByRole('button', { name: /create account/i }));
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(body).toMatchObject({ email: 'new@example.com', password: 'abc123', displayName: 'New Person' });
        expect(body).not.toHaveProperty('username');
    });

    it('loads the google logo from the server endpoint and falls back to an inline svg', async () => {
        renderWithProviders(<AuthModal open initialTab='login' onClose={() => {}} />);
        const img = document.querySelector('img') as HTMLImageElement;
        expect(img).toHaveAttribute('src', '/api/auth/google-logo');
        expect(document.querySelector('svg path[fill="#EA4335"]')).toBeNull();
        fireEvent.error(img);
        await waitFor(() => {
            expect(document.querySelector('img')).toBeNull();
            expect(document.querySelector('svg path[fill="#EA4335"]')).not.toBeNull();
        });
    });

    it('renders the google button with a white background to match the logo asset', () => {
        renderWithProviders(<AuthModal open initialTab='login' onClose={() => {}} />);
        const button = (document.querySelector('img') as HTMLImageElement).closest('a');
        expect(button).not.toBeNull();
        expect(button?.className).toContain('bg-white');
    });

    it('points the google button at the current route via redirect_to', () => {
        renderWithProviders(<AuthModal open initialTab='login' onClose={() => {}} />, { route: '/game/chess' });
        const button = (document.querySelector('img') as HTMLImageElement).closest('a');
        expect(button?.getAttribute('href')).toBe('/api/auth/google?redirect_to=%2Fgame%2Fchess');
    });
});
