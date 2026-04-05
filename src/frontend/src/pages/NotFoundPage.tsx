import { Link } from 'react-router-dom';
import PageMeta from '../components/PageMeta';

/**
 * Renders a 404 not found page with a link back to the home route.
 */
export default function NotFoundPage() {
    return (
        <div className='container mx-auto flex flex-col items-center px-4 py-20 text-center'>
            <PageMeta title="Page Not Found" noindex />
            <h1 className='mb-2 text-8xl font-bold opacity-20'>404</h1>
            <h2 className='mb-4 text-2xl font-semibold'>Page not found</h2>
            <p className='mb-8 opacity-60'>The page you're looking for doesn't exist.</p>
            <Link to='/' className='btn btn-primary'>
                Go home
            </Link>
        </div>
    );
}
