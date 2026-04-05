import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { updateStatsPublic } from '../api/stats';
import { useAuth } from '../hooks/useAuth';
import { queryClient } from '../queryClient';
import PageMeta from '../components/PageMeta';

const THEMES = ['dark', 'light', 'cupcake', 'cyberpunk', 'synthwave'];

export default function SettingsPage() {
    const { user } = useAuth();
    const [statsPublic, setStatsPublic] = useState(user?.statsPublic ?? false);

    const mutation = useMutation({
        mutationFn: (value: boolean) => updateStatsPublic(value),
        onSuccess: (_data, value) => {
            setStatsPublic(value);
            queryClient.setQueryData(['user'], (old: typeof user) =>
                old ? { ...old, statsPublic: value } : old,
            );
        },
    });

    function setTheme(theme: string) {
        document.documentElement.setAttribute('data-theme', theme);
    }

    function handleStatsToggle() {
        const next = !statsPublic;
        mutation.mutate(next);
    }

    return (
        <div className='container mx-auto max-w-2xl px-4 py-10'>
            <PageMeta title='Settings' noindex />
            <h1 className='mb-6 text-4xl font-bold'>Settings</h1>

            <div className='card bg-base-200 shadow'>
                <div className='card-body gap-6'>
                    <div>
                        <h2 className='mb-3 text-lg font-semibold'>Theme</h2>
                        <div className='flex flex-wrap gap-2'>
                            {THEMES.map(theme => (
                                <button
                                    key={theme}
                                    className='btn btn-outline btn-sm capitalize'
                                    onClick={() => setTheme(theme)}>
                                    {theme}
                                </button>
                            ))}
                        </div>
                    </div>

                    {user && (
                        <>
                            <div className='divider' />
                            <div>
                                <h2 className='mb-1 text-lg font-semibold'>Account</h2>
                                <p className='text-sm opacity-60'>Logged in as {user.email}</p>
                            </div>

                            <div className='divider' />
                            <div>
                                <h2 className='mb-1 text-lg font-semibold'>Statistics</h2>
                                <label className='flex items-center gap-3 cursor-pointer'>
                                    <input
                                        type='checkbox'
                                        className='toggle toggle-primary'
                                        checked={statsPublic}
                                        onChange={handleStatsToggle}
                                        disabled={mutation.isPending}
                                    />
                                    <span className='text-sm'>
                                        Show my stats on leaderboards and allow other players to view them
                                    </span>
                                </label>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
