import React from 'react';

interface Props {
    children: React.ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    crashCount: number;
}

export default class ErrorBoundary extends React.Component<Props, State> {
    private routeKey: string;

    constructor(props: Props) {
        super(props);
        this.routeKey = `crash_count_${window.location.pathname}`;
        const crashCount = parseInt(localStorage.getItem(this.routeKey) ?? '0', 10);
        this.state = { hasError: false, error: null, crashCount };
    }

    static getDerivedStateFromError(error: Error): Partial<State> {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('ErrorBoundary caught:', error, info);
        const count = this.state.crashCount + 1;
        localStorage.setItem(this.routeKey, String(count));
        this.setState({ crashCount: count });
    }

    componentDidMount() {
        if (!this.state.hasError) {
            localStorage.removeItem(this.routeKey);
            if (this.state.crashCount !== 0) {
                this.setState({ crashCount: 0 });
            }
        }
    }

    render() {
        if (!this.state.hasError) {
            return this.props.children;
        }

        const { crashCount, error } = this.state;
        const loopDetected = crashCount > 3;

        return (
            <div className='container mx-auto flex flex-col items-center px-4 py-20 text-center'>
                <h2 className='mb-4 text-2xl font-semibold'>Something went wrong</h2>
                <p className='mb-2 opacity-60'>
                    {error?.message ?? 'An unexpected error occurred.'}
                </p>
                {loopDetected && (
                    <p className='mb-6 text-sm text-warning'>
                        This page is repeatedly crashing. Going home is recommended.
                    </p>
                )}
                <div className='flex gap-4'>
                    {!loopDetected && (
                        <button
                            className='btn btn-primary'
                            onClick={() => window.location.reload()}>
                            Reload page
                        </button>
                    )}
                    <button
                        className='btn btn-outline'
                        onClick={() => (window.location.href = '/')}>
                        Go home
                    </button>
                </div>
            </div>
        );
    }
}
