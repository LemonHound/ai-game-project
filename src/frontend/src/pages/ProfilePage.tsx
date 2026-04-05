import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import PageMeta from '../components/PageMeta';

/**
 * User profile page displaying account details (display name, email, auth provider).
 * Redirects to unauthenticated state when no user session is present.
 */
export default function ProfilePage() {
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className='flex justify-center py-20'>
                <span className='loading loading-spinner loading-lg' />
            </div>
        );
    }

    if (!user) {
        return (
            <div className='flex flex-col items-center gap-4 py-20'>
                <p className='text-lg'>You are not logged in.</p>
                <Link to='/' className='btn btn-primary'>
                    Go Home
                </Link>
            </div>
        );
    }

    return (
        <div className='container mx-auto max-w-2xl px-4 py-10'>
            <PageMeta title='Profile' noindex />
            <h1 className='mb-6 text-4xl font-bold'>Profile</h1>
            <div className='card bg-base-200 shadow'>
                <div className='card-body gap-4'>
                    <div className='flex items-center gap-4'>
                        <div className='avatar placeholder'>
                            <div className='bg-neutral text-neutral-content w-16 rounded-full'>
                                <span className='text-2xl'>{user.displayName[0].toUpperCase()}</span>
                            </div>
                        </div>
                        <div>
                            <h2 className='text-xl font-semibold'>{user.displayName}</h2>
                            <p className='text-sm opacity-60'>@{user.username}</p>
                        </div>
                    </div>
                    <div className='divider' />
                    <div className='grid grid-cols-2 gap-4 text-sm'>
                        <div>
                            <p className='opacity-60'>Email</p>
                            <p>{user.email}</p>
                        </div>
                        <div>
                            <p className='opacity-60'>Auth Provider</p>
                            <p className='capitalize'>{user.authProvider}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
