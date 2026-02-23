import { RiGithubFill, RiGoogleFill } from 'react-icons/ri';
import { toast } from 'sonner';

import { signIn } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';

export function SocialProviders({
    configs = { google_auth_enabled: 'true', github_auth_enabled: 'true' },
    callbackUrl,
    loading,
    setLoading,
}: {
    configs?: Record<string, string>;
    callbackUrl?: string;
    loading: boolean;
    setLoading: (loading: boolean) => void;
}) {
    const handleSignIn = async ({ provider }: { provider: "google" | "github" }) => {
        await signIn.social(
            {
                provider: provider,
                callbackURL: callbackUrl,
            },
            {
                onRequest: () => {
                    setLoading(true);
                },
                onResponse: () => {
                    setLoading(false);
                },
                onError: (ctx) => {
                    toast.error(ctx.error.message || 'sign in failed');
                    setLoading(false);
                },
            }
        );
    };

    const providers = [];

    if (configs.google_auth_enabled === 'true') {
        providers.push({
            name: 'google',
            title: 'Sign in with Google',
            icon: <RiGoogleFill className="w-5 h-5" />,
            onClick: () => handleSignIn({ provider: 'google' }),
        });
    }

    if (configs.github_auth_enabled === 'true') {
        providers.push({
            name: 'github',
            title: 'Sign in with Github',
            icon: <RiGithubFill className="w-5 h-5" />,
            onClick: () => handleSignIn({ provider: 'github' }),
        });
    }

    return (
        <div className='flex w-full items-center gap-2 flex-col justify-between'>
            {providers.map((provider) => (
                <Button
                    key={provider.name}
                    variant="outline"
                    className="w-full gap-2"
                    disabled={loading}
                    onClick={provider.onClick}
                >
                    {provider.icon}
                    <span>{provider.title}</span>
                </Button>
            ))}
        </div>
    );
}
