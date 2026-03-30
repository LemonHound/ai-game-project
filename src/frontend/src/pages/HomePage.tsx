import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchGames } from '../api/games';

/**
 * Home page with a hero section linking to the games listing.
 */
export default function HomePage() {
    const { data: games = [], isLoading } = useQuery({
        queryKey: ['games'],
        queryFn: () => fetchGames('active'),
    });

    return (
        <div className='hero min-h-[60vh] bg-base-200'>
            <div className='hero-content text-center'>
                <div className='max-w-2xl'>
                    <h1 className='text-5xl font-bold'>AI Game Hub</h1>
                    <p className='py-6 text-lg opacity-80'>
                        Play classic games against adaptive AI. Every opponent learns and evolves.
                    </p>
                    <Link to='/games' className='btn btn-primary btn-lg'>
                        Browse Games
                    </Link>
                </div>
            </div>
        </div>
    );
}
