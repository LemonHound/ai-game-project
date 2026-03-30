import { Outlet } from 'react-router-dom';
import Footer from './Footer';
import Navbar from './Navbar';

/**
 * Root layout component wrapping all pages with Navbar at the top and Footer at the bottom.
 * Child routes are rendered via the React Router Outlet.
 */
export default function Layout() {
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
