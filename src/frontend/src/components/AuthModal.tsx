import { useEffect, useRef, useState } from 'react';
import { useLogin, useRegister } from '../hooks/useAuth';

interface Props {
    open: boolean;
    initialTab: 'login' | 'register';
    onClose: () => void;
}

function EyeIcon({ off }: { off: boolean }) {
    return (
        <svg
            xmlns='http://www.w3.org/2000/svg'
            className='h-5 w-5'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth={2}
            strokeLinecap='round'
            strokeLinejoin='round'
            aria-hidden='true'>
            {off ? (
                <>
                    <path d='M9.88 9.88a3 3 0 0 0 4.24 4.24' />
                    <path d='M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68' />
                    <path d='M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61' />
                    <line x1='2' y1='2' x2='22' y2='22' />
                </>
            ) : (
                <>
                    <path d='M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z' />
                    <circle cx='12' cy='12' r='3' />
                </>
            )}
        </svg>
    );
}

function TextField({
    id,
    label,
    type,
    value,
    onChange,
    required,
    autoComplete,
}: {
    id: string;
    label: string;
    type: string;
    value: string;
    onChange: (value: string) => void;
    required?: boolean;
    autoComplete?: string;
}) {
    return (
        <div className='form-control w-full'>
            <label className='label-text mb-1 font-medium' htmlFor={id}>
                {label}
            </label>
            <input
                id={id}
                type={type}
                className='input input-bordered w-full'
                required={required}
                autoComplete={autoComplete}
                value={value}
                onChange={e => onChange(e.target.value)}
            />
        </div>
    );
}

function PasswordField({
    id,
    label,
    value,
    onChange,
    required = true,
    minLength,
    autoComplete,
}: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    required?: boolean;
    minLength?: number;
    autoComplete?: string;
}) {
    const [show, setShow] = useState(false);
    return (
        <div className='form-control w-full'>
            <label className='label-text mb-1 font-medium' htmlFor={id}>
                {label}
            </label>
            <div className='relative'>
                <input
                    id={id}
                    type={show ? 'text' : 'password'}
                    className='input input-bordered w-full pr-12'
                    required={required}
                    minLength={minLength}
                    autoComplete={autoComplete}
                    value={value}
                    onChange={e => onChange(e.target.value)}
                />
                <button
                    type='button'
                    className='absolute inset-y-0 right-0 flex items-center px-3 text-base-content/60 hover:text-base-content'
                    onClick={() => setShow(s => !s)}
                    aria-label={show ? 'Hide password' : 'Show password'}
                    aria-pressed={show}>
                    <EyeIcon off={show} />
                </button>
            </div>
        </div>
    );
}

function GoogleLogoFallback() {
    return (
        <svg className='h-5 w-5' viewBox='0 0 48 48' aria-hidden='true'>
            <path
                fill='#EA4335'
                d='M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z'
            />
            <path
                fill='#4285F4'
                d='M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z'
            />
            <path
                fill='#FBBC05'
                d='M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z'
            />
            <path
                fill='#34A853'
                d='M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z'
            />
            <path fill='none' d='M0 0h48v48H0z' />
        </svg>
    );
}

function GoogleButton() {
    const [failed, setFailed] = useState(false);
    return (
        <a
            href='/api/auth/google'
            className='btn w-full gap-2 border-[#dadce0] bg-white text-[#1f1f1f] hover:border-[#dadce0] hover:bg-[#f8f9fa] hover:text-[#1f1f1f]'>
            {failed ? (
                <GoogleLogoFallback />
            ) : (
                <img
                    src='/api/auth/google-logo'
                    alt=''
                    aria-hidden='true'
                    className='h-5 w-5'
                    onError={() => setFailed(true)}
                />
            )}
            Continue with Google
        </a>
    );
}

export default function AuthModal({ open, initialTab, onClose }: Props) {
    const [tab, setTab] = useState(initialTab);
    const dialogRef = useRef<HTMLDialogElement>(null);

    const login = useLogin();
    const register = useRegister();

    const [loginForm, setLoginForm] = useState({ email: '', password: '', rememberMe: false });
    const [registerForm, setRegisterForm] = useState({ displayName: '', email: '', password: '', confirmPassword: '' });
    const [registerError, setRegisterError] = useState<string | null>(null);

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

    function switchTab(next: 'login' | 'register') {
        setRegisterError(null);
        setTab(next);
    }

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault();
        await login.mutateAsync(loginForm);
        onClose();
    }

    async function handleRegister(e: React.FormEvent) {
        e.preventDefault();
        setRegisterError(null);
        if (registerForm.password !== registerForm.confirmPassword) {
            setRegisterError('Passwords do not match');
            return;
        }
        await register.mutateAsync({
            email: registerForm.email,
            password: registerForm.password,
            displayName: registerForm.displayName,
        });
        onClose();
    }

    const mutationError = (tab === 'login' ? login.error : register.error)?.message;
    const error = tab === 'register' ? (registerError ?? mutationError) : mutationError;

    return (
        <dialog ref={dialogRef} className='modal' onClose={onClose}>
            <div className='modal-box w-full max-w-md'>
                <button
                    className='btn btn-sm btn-circle btn-ghost absolute right-2 top-2'
                    onClick={onClose}
                    aria-label='Close'>
                    ✕
                </button>

                <div role='tablist' className='tabs tabs-bordered mb-6'>
                    <button
                        role='tab'
                        className={`tab ${tab === 'login' ? 'tab-active' : ''}`}
                        onClick={() => switchTab('login')}>
                        Login
                    </button>
                    <button
                        role='tab'
                        className={`tab ${tab === 'register' ? 'tab-active' : ''}`}
                        onClick={() => switchTab('register')}>
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
                        <TextField
                            id='login-email'
                            label='Email'
                            type='email'
                            required
                            autoComplete='email'
                            value={loginForm.email}
                            onChange={v => setLoginForm(f => ({ ...f, email: v }))}
                        />
                        <PasswordField
                            id='login-password'
                            label='Password'
                            autoComplete='current-password'
                            value={loginForm.password}
                            onChange={v => setLoginForm(f => ({ ...f, password: v }))}
                        />
                        <label className='flex cursor-pointer items-center gap-2'>
                            <input
                                type='checkbox'
                                className='checkbox checkbox-sm'
                                checked={loginForm.rememberMe}
                                onChange={e => setLoginForm(f => ({ ...f, rememberMe: e.target.checked }))}
                            />
                            <span className='label-text'>Remember me</span>
                        </label>
                        <button type='submit' className='btn btn-primary w-full' disabled={login.isPending}>
                            {login.isPending ? <span className='loading loading-spinner loading-sm' /> : 'Login'}
                        </button>
                        <div className='divider'>OR</div>
                        <GoogleButton />
                    </form>
                ) : (
                    <form onSubmit={handleRegister} className='flex flex-col gap-4'>
                        <TextField
                            id='register-displayname'
                            label='Display Name'
                            type='text'
                            autoComplete='nickname'
                            value={registerForm.displayName}
                            onChange={v => setRegisterForm(f => ({ ...f, displayName: v }))}
                        />
                        <TextField
                            id='register-email'
                            label='Email'
                            type='email'
                            required
                            autoComplete='email'
                            value={registerForm.email}
                            onChange={v => setRegisterForm(f => ({ ...f, email: v }))}
                        />
                        <PasswordField
                            id='register-password'
                            label='Password'
                            minLength={6}
                            autoComplete='new-password'
                            value={registerForm.password}
                            onChange={v => setRegisterForm(f => ({ ...f, password: v }))}
                        />
                        <PasswordField
                            id='register-confirm'
                            label='Confirm Password'
                            minLength={6}
                            autoComplete='new-password'
                            value={registerForm.confirmPassword}
                            onChange={v => setRegisterForm(f => ({ ...f, confirmPassword: v }))}
                        />
                        <button type='submit' className='btn btn-primary w-full' disabled={register.isPending}>
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
