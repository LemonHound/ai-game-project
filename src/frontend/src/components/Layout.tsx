import { Outlet, useLocation } from 'react-router-dom';
import Footer from './Footer';
import Navbar from './Navbar';

const ACTIVE_GAME_ROUTES = [
    '/game/tic-tac-toe',
    '/game/chess',
    '/game/checkers',
    '/game/connect4',
    '/game/dots-and-boxes',
];

export function isActiveGameRoute(pathname: string): boolean {
    return ACTIVE_GAME_ROUTES.includes(pathname);
}

export default function Layout() {
    const { pathname } = useLocation();

    if (isActiveGameRoute(pathname)) {
        return (
            <div className='flex h-[100dvh] flex-col overflow-hidden'>
                <Navbar />
                <main className='min-h-0 flex-1'>
                    <Outlet />
                </main>
            </div>
        );
    }

    return (
        <div className='flex min-h-screen flex-col'>
            <Navbar />
            <main className='flex-1'>
                <Outlet />
            </main>
            <Footer />
        </div>
    );
}
