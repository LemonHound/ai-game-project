import { Link } from 'react-router-dom';

/**
 * Site-wide footer with navigation links and copyright notice.
 */
export default function Footer() {
    return (
        <footer className='footer footer-center bg-base-300 p-6 text-base-content'>
            <nav className='flex gap-6'>
                <Link to='/' className='link link-hover'>
                    Home
                </Link>
                <Link to='/games' className='link link-hover'>
                    Games
                </Link>
                <Link to='/about' className='link link-hover'>
                    About
                </Link>
            </nav>
            <p className='text-sm opacity-60'>&copy; {new Date().getFullYear()} AI Game Hub</p>
        </footer>
    );
}
