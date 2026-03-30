import { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import NotificationRenderer from './components/NotificationRenderer';
import { queryClient } from './queryClient';
import { useNotificationStore } from './store/notifications';
import AboutPage from './pages/AboutPage';
import GamesPage from './pages/GamesPage';
import HomePage from './pages/HomePage';
import NotFoundPage from './pages/NotFoundPage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';
import CheckersPage from './pages/games/CheckersPage';
import ChessPage from './pages/games/ChessPage';
import Connect4Page from './pages/games/Connect4Page';
import DotsAndBoxesPage from './pages/games/DotsAndBoxesPage';
import PongPage from './pages/games/PongPage';
import TicTacToePage from './pages/games/TicTacToePage';

function OAuthResultHandler() {
    const location = useLocation();
    const push = useNotificationStore(s => s.push);

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const error = params.get('error');
        const login = params.get('login');

        if (error === 'google_auth_failed') {
            push({
                level: 'error',
                title: 'Google sign-in failed',
                description: 'Authentication was not completed. Please try again.',
                timer: 8000,
            });
            window.history.replaceState({}, '', location.pathname);
        } else if (login === 'success') {
            queryClient.invalidateQueries({ queryKey: ['user'] });
            window.history.replaceState({}, '', location.pathname);
        }
    }, [location.search, push]);

    return null;
}

/**
 * Root application component. Sets up routing, error boundaries, and notification rendering.
 */
export default function App() {
    return (
        <BrowserRouter>
            <OAuthResultHandler />
            <NotificationRenderer />
            <Routes>
                <Route element={<Layout />}>
                    <Route
                        path='/'
                        element={
                            <ErrorBoundary>
                                <HomePage />
                            </ErrorBoundary>
                        }
                    />
                    <Route
                        path='/games'
                        element={
                            <ErrorBoundary>
                                <GamesPage />
                            </ErrorBoundary>
                        }
                    />
                    <Route
                        path='/about'
                        element={
                            <ErrorBoundary>
                                <AboutPage />
                            </ErrorBoundary>
                        }
                    />
                    <Route
                        path='/profile'
                        element={
                            <ErrorBoundary>
                                <ProfilePage />
                            </ErrorBoundary>
                        }
                    />
                    <Route
                        path='/settings'
                        element={
                            <ErrorBoundary>
                                <SettingsPage />
                            </ErrorBoundary>
                        }
                    />
                    <Route
                        path='/game/tic-tac-toe'
                        element={
                            <ErrorBoundary>
                                <TicTacToePage />
                            </ErrorBoundary>
                        }
                    />
                    <Route
                        path='/game/chess'
                        element={
                            <ErrorBoundary>
                                <ChessPage />
                            </ErrorBoundary>
                        }
                    />
                    <Route
                        path='/game/checkers'
                        element={
                            <ErrorBoundary>
                                <CheckersPage />
                            </ErrorBoundary>
                        }
                    />
                    <Route
                        path='/game/connect4'
                        element={
                            <ErrorBoundary>
                                <Connect4Page />
                            </ErrorBoundary>
                        }
                    />
                    <Route
                        path='/game/dots-and-boxes'
                        element={
                            <ErrorBoundary>
                                <DotsAndBoxesPage />
                            </ErrorBoundary>
                        }
                    />
                    <Route
                        path='/game/pong'
                        element={
                            <ErrorBoundary>
                                <PongPage />
                            </ErrorBoundary>
                        }
                    />
                    <Route path='*' element={<NotFoundPage />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}
