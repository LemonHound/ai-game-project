import { Link } from 'react-router-dom';

/**
 * Site-wide footer with copyright, navigation links, and support CTA.
 */
export default function Footer() {
    return (
        <footer className='footer footer-center bg-base-300 p-6 text-base-content'>
            <div className='flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm'>
                <span className='opacity-60'>&copy; {new Date().getFullYear()} AI Game Hub</span>
                <span className='opacity-30'>·</span>
                <Link to='/about' className='link link-hover opacity-70'>
                    About
                </Link>
                <span className='opacity-30'>·</span>
                <a
                    href='https://buymeacoffee.com/aigamehub'
                    target='_blank'
                    rel='noopener noreferrer'
                    className='link link-hover opacity-70'>
                    Support
                </a>
                <span className='opacity-30'>·</span>
                <span className='cursor-not-allowed opacity-40' title='Coming soon'>
                    Discord
                </span>
            </div>
        </footer>
    );
}
