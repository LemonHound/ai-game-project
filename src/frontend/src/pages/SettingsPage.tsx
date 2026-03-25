import { useAuth } from '../hooks/useAuth';

const THEMES = ['dark', 'light', 'cupcake', 'cyberpunk', 'synthwave'];

export default function SettingsPage() {
    const { user } = useAuth();

    function setTheme(theme: string) {
        document.documentElement.setAttribute('data-theme', theme);
    }

    return (
        <div className="container mx-auto max-w-2xl px-4 py-10">
            <h1 className="mb-6 text-4xl font-bold">Settings</h1>

            <div className="card bg-base-200 shadow">
                <div className="card-body gap-6">
                    <div>
                        <h2 className="mb-3 text-lg font-semibold">Theme</h2>
                        <div className="flex flex-wrap gap-2">
                            {THEMES.map(theme => (
                                <button
                                    key={theme}
                                    className="btn btn-outline btn-sm capitalize"
                                    onClick={() => setTheme(theme)}
                                >
                                    {theme}
                                </button>
                            ))}
                        </div>
                    </div>

                    {user && (
                        <>
                            <div className="divider" />
                            <div>
                                <h2 className="mb-1 text-lg font-semibold">Account</h2>
                                <p className="text-sm opacity-60">Logged in as {user.email}</p>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
