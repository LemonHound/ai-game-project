/**
 * Site-wide footer with copyright notice.
 */
export default function Footer() {
    return (
        <footer className='footer footer-center bg-base-300 p-6 text-base-content'>
            <p className='text-sm opacity-60'>&copy; {new Date().getFullYear()} AI Game Hub</p>
        </footer>
    );
}
