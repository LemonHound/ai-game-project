import React from 'react';

interface Props {
    children: React.ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    crashCount: number;
}

/**
 * React error boundary that catches rendering errors and displays a recovery UI.
 * Tracks crash count in localStorage per route; warns about crash loops after 3 crashes.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
    private routeKey: string;

    /** @param props - Component props containing the children to protect. */
    constructor(props: Props) {
        super(props);
        this.routeKey = `crash_count_${window.location.pathname}`;
        const crashCount = parseInt(localStorage.getItem(this.routeKey) ?? '0', 10);
        this.state = { hasError: false, error: null, crashCount };
    }

    /**
     * Updates state to trigger the error UI when a render error is caught.
     * @param error - The error that was thrown during rendering.
     * @returns Partial state update setting hasError and the caught error.
     */
    static getDerivedStateFromError(error: Error): Partial<State> {
        return { hasError: true, error };
    }

    /**
     * Logs the error and increments the crash counter in localStorage.
     * @param error - The error that was thrown.
     * @param info - React component stack info.
     */
    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('ErrorBoundary caught:', error, info);
        const count = this.state.crashCount + 1;
        localStorage.setItem(this.routeKey, String(count));
        this.setState({ crashCount: count });
    }

    /** Clears the crash counter from localStorage on successful mount. */
    componentDidMount() {
        if (!this.state.hasError) {
            localStorage.removeItem(this.routeKey);
            if (this.state.crashCount !== 0) {
                this.setState({ crashCount: 0 });
            }
        }
    }

    /** @returns The children if no error, otherwise the recovery UI. */
    render() {
        if (!this.state.hasError) {
            return this.props.children;
        }

        const { crashCount, error } = this.state;
        const loopDetected = crashCount > 3;

        return (
            <div className='container mx-auto flex flex-col items-center px-4 py-20 text-center'>
                <h2 className='mb-4 text-2xl font-semibold'>Something went wrong</h2>
                <p className='mb-2 opacity-60'>{error?.message ?? 'An unexpected error occurred.'}</p>
                {loopDetected && (
                    <p className='mb-6 text-sm text-warning'>
                        This page is repeatedly crashing. Going home is recommended.
                    </p>
                )}
                <div className='flex gap-4'>
                    {!loopDetected && (
                        <button className='btn btn-primary' onClick={() => window.location.reload()}>
                            Reload page
                        </button>
                    )}
                    <button className='btn btn-outline' onClick={() => (window.location.href = '/')}>
                        Go home
                    </button>
                </div>
            </div>
        );
    }
}
