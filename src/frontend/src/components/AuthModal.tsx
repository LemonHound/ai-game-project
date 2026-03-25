import { useEffect, useRef, useState } from 'react';
import { useLogin, useRegister } from '../hooks/useAuth';

interface Props {
    open: boolean;
    initialTab: 'login' | 'register';
    onClose: () => void;
}

export default function AuthModal({ open, initialTab, onClose }: Props) {
    const [tab, setTab] = useState(initialTab);
    const dialogRef = useRef<HTMLDialogElement>(null);

    const login = useLogin();
    const register = useRegister();

    const [loginForm, setLoginForm] = useState({ email: '', password: '', rememberMe: false });
    const [registerForm, setRegisterForm] = useState({ username: '', email: '', password: '', displayName: '' });

    useEffect(() => {
        setTab(initialTab);
    }, [initialTab]);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        if (open) {
            dialog.showModal();
        } else {
            dialog.close();
        }
    }, [open]);

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault();
        await login.mutateAsync(loginForm);
        onClose();
    }

    async function handleRegister(e: React.FormEvent) {
        e.preventDefault();
        await register.mutateAsync(registerForm);
        onClose();
    }

    const error = (tab === 'login' ? login.error : register.error)?.message;

    return (
        <dialog ref={dialogRef} className='modal' onClose={onClose}>
            <div className='modal-box w-full max-w-md'>
                <button className='btn btn-sm btn-circle btn-ghost absolute right-2 top-2' onClick={onClose}>
                    ✕
                </button>

                <div role='tablist' className='tabs tabs-bordered mb-6'>
                    <button
                        role='tab'
                        className={`tab ${tab === 'login' ? 'tab-active' : ''}`}
                        onClick={() => setTab('login')}>
                        Login
                    </button>
                    <button
                        role='tab'
                        className={`tab ${tab === 'register' ? 'tab-active' : ''}`}
                        onClick={() => setTab('register')}>
                        Sign Up
                    </button>
                </div>

                {error && (
                    <div className='alert alert-error mb-4'>
                        <span>{error}</span>
                    </div>
                )}

                {tab === 'login' ? (
                    <form onSubmit={handleLogin} className='flex flex-col gap-4'>
                        <label className='form-control'>
                            <div className='label'>
                                <span className='label-text'>Email</span>
                            </div>
                            <input
                                type='email'
                                className='input input-bordered'
                                required
                                value={loginForm.email}
                                onChange={e => setLoginForm(f => ({ ...f, email: e.target.value }))}
                            />
                        </label>
                        <label className='form-control'>
                            <div className='label'>
                                <span className='label-text'>Password</span>
                            </div>
                            <input
                                type='password'
                                className='input input-bordered'
                                required
                                value={loginForm.password}
                                onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
                            />
                        </label>
                        <label className='label cursor-pointer justify-start gap-2'>
                            <input
                                type='checkbox'
                                className='checkbox checkbox-sm'
                                checked={loginForm.rememberMe}
                                onChange={e => setLoginForm(f => ({ ...f, rememberMe: e.target.checked }))}
                            />
                            <span className='label-text'>Remember me</span>
                        </label>
                        <button type='submit' className='btn btn-primary' disabled={login.isPending}>
                            {login.isPending ? <span className='loading loading-spinner loading-sm' /> : 'Login'}
                        </button>
                        <div className='divider'>OR</div>
                        <a href='/api/auth/google' className='btn btn-outline gap-2'>
                            <svg className='h-5 w-5' viewBox='0 0 24 24'>
                                <path
                                    fill='currentColor'
                                    d='M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z'
                                />
                            </svg>
                            Continue with Google
                        </a>
                    </form>
                ) : (
                    <form onSubmit={handleRegister} className='flex flex-col gap-4'>
                        <label className='form-control'>
                            <div className='label'>
                                <span className='label-text'>Username</span>
                            </div>
                            <input
                                type='text'
                                className='input input-bordered'
                                required
                                minLength={3}
                                value={registerForm.username}
                                onChange={e => setRegisterForm(f => ({ ...f, username: e.target.value }))}
                            />
                        </label>
                        <label className='form-control'>
                            <div className='label'>
                                <span className='label-text'>Display Name</span>
                            </div>
                            <input
                                type='text'
                                className='input input-bordered'
                                value={registerForm.displayName}
                                onChange={e => setRegisterForm(f => ({ ...f, displayName: e.target.value }))}
                            />
                        </label>
                        <label className='form-control'>
                            <div className='label'>
                                <span className='label-text'>Email</span>
                            </div>
                            <input
                                type='email'
                                className='input input-bordered'
                                required
                                value={registerForm.email}
                                onChange={e => setRegisterForm(f => ({ ...f, email: e.target.value }))}
                            />
                        </label>
                        <label className='form-control'>
                            <div className='label'>
                                <span className='label-text'>Password</span>
                            </div>
                            <input
                                type='password'
                                className='input input-bordered'
                                required
                                minLength={6}
                                value={registerForm.password}
                                onChange={e => setRegisterForm(f => ({ ...f, password: e.target.value }))}
                            />
                        </label>
                        <button type='submit' className='btn btn-primary' disabled={register.isPending}>
                            {register.isPending ? (
                                <span className='loading loading-spinner loading-sm' />
                            ) : (
                                'Create Account'
                            )}
                        </button>
                    </form>
                )}
            </div>
            <form method='dialog' className='modal-backdrop'>
                <button onClick={onClose}>close</button>
            </form>
        </dialog>
    );
}
