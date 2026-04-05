import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ErrorBoundary from './ErrorBoundary';

function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
    if (shouldThrow) throw new Error('Test error');
    return <div>No error</div>;
}

describe('ErrorBoundary', () => {
    it('renders children when no error', () => {
        render(
            <ErrorBoundary>
                <div>Child content</div>
            </ErrorBoundary>
        );
        expect(screen.getByText('Child content')).toBeInTheDocument();
    });

    it('error boundary renders fallback on error', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        render(
            <ErrorBoundary>
                <ThrowingComponent shouldThrow={true} />
            </ErrorBoundary>
        );
        expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
        vi.restoreAllMocks();
    });

    it('shows recovery button', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        render(
            <ErrorBoundary>
                <ThrowingComponent shouldThrow={true} />
            </ErrorBoundary>
        );
        expect(screen.getByText(/go home/i)).toBeInTheDocument();
        vi.restoreAllMocks();
    });
});
