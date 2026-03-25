import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, useLogout } from '../hooks/useAuth';
import AuthModal from './AuthModal';

export default function Navbar() {
    const { user } = useAuth();
    const logout = useLogout();
    const navigate = useNavigate();
    const [authModalOpen, setAuthModalOpen] = useState(false);
    const [authModalTab, setAuthModalTab] = useState<'login' | 'register'>('login');

    function openLogin() {
        setAuthModalTab('login');
        setAuthModalOpen(true);
    }

    function openRegister() {
        setAuthModalTab('register');
        setAuthModalOpen(true);
    }

    async function handleLogout() {
        await logout.mutateAsync();
        navigate('/');
    }

    return (
        <>
            <div className='navbar bg-base-300 shadow-md'>
                <div className='navbar-start'>
                    <div className='dropdown'>
                        <div tabIndex={0} role='button' className='btn btn-ghost lg:hidden'>
                            <svg className='h-5 w-5' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                                <path
                                    strokeLinecap='round'
                                    strokeLinejoin='round'
                                    strokeWidth='2'
                                    d='M4 6h16M4 12h8m-8 6h16'
                                />
                            </svg>
                        </div>
                        <ul
                            tabIndex={0}
                            className='menu menu-sm dropdown-content bg-base-100 rounded-box z-10 mt-3 w-52 p-2 shadow'>
                            <li>
                                <Link to='/'>Home</Link>
                            </li>
                            <li>
                                <Link to='/games'>Games</Link>
                            </li>
                            <li>
                                <Link to='/about'>About</Link>
                            </li>
                        </ul>
                    </div>
                    <Link to='/' className='btn btn-ghost text-xl font-bold'>
                        AI Game Hub
                    </Link>
                </div>

                <div className='navbar-center hidden lg:flex'>
                    <ul className='menu menu-horizontal px-1'>
                        <li>
                            <Link to='/'>Home</Link>
                        </li>
                        <li>
                            <Link to='/games'>Games</Link>
                        </li>
                        <li>
                            <Link to='/about'>About</Link>
                        </li>
                    </ul>
                </div>

                <div className='navbar-end gap-2'>
                    {user ? (
                        <div className='dropdown dropdown-end'>
                            <div tabIndex={0} role='button' className='btn btn-ghost btn-circle avatar placeholder'>
                                <div className='bg-neutral text-neutral-content w-10 rounded-full'>
                                    <span className='text-sm'>{user.displayName[0].toUpperCase()}</span>
                                </div>
                            </div>
                            <ul
                                tabIndex={0}
                                className='menu menu-sm dropdown-content bg-base-100 rounded-box z-10 mt-3 w-52 p-2 shadow'>
                                <li className='menu-title'>{user.displayName}</li>
                                <li>
                                    <Link to='/profile'>Profile</Link>
                                </li>
                                <li>
                                    <Link to='/settings'>Settings</Link>
                                </li>
                                <li>
                                    <button onClick={handleLogout}>Logout</button>
                                </li>
                            </ul>
                        </div>
                    ) : (
                        <>
                            <button className='btn btn-ghost btn-sm' onClick={openLogin}>
                                Login
                            </button>
                            <button className='btn btn-primary btn-sm' onClick={openRegister}>
                                Sign Up
                            </button>
                        </>
                    )}
                </div>
            </div>

            <AuthModal open={authModalOpen} initialTab={authModalTab} onClose={() => setAuthModalOpen(false)} />
        </>
    );
}
