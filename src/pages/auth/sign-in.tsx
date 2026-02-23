import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { signIn } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SocialProviders } from '@/components/auth/social-providers';

export default function SignInPage() {
    const { t } = useTranslation('auth');
    const [searchParams] = useSearchParams();
    const callbackUrl = searchParams.get('callbackUrl') || '/';

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    // We can fetch configs from server if needed, for now default to true
    const configs = { email_auth_enabled: 'true', google_auth_enabled: 'true', github_auth_enabled: 'true' };
    const isEmailAuthEnabled = configs.email_auth_enabled !== 'false';

    const handleSignIn = async () => {
        if (loading) return;

        if (!email || !password) {
            toast.error(t('errors.required'));
            return;
        }

        await signIn.email(
            {
                email,
                password,
                callbackURL: callbackUrl,
            },
            {
                onRequest: () => setLoading(true),
                onResponse: () => setLoading(false),
                onSuccess: () => {
                    console.log('Sign in success', callbackUrl);
                    // navigate(callbackUrl);
                },
                onError: (ctx) => {
                    toast.error(ctx.error.message || t('errors.failed'));
                    setLoading(false);
                },
            }
        );
    };

    return (
        <div className="flex items-center justify-center min-h-screen p-4 bg-background text-foreground">
            <Card className="mx-auto w-full md:max-w-md shadow-md border-border">
                <CardHeader>
                    <CardTitle className="text-lg md:text-xl">
                        <h1>{t('title')}</h1>
                    </CardTitle>
                    <CardDescription className="text-xs md:text-sm">
                        <h2>{t('subtitle')}</h2>
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4">
                        {isEmailAuthEnabled && (
                            <>
                                <div className="grid gap-2">
                                    <Label htmlFor="email">{t('email')}</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder={t('emailPlaceholder')}
                                        required
                                        onChange={(e) => setEmail(e.target.value)}
                                        value={email}
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <div className="flex items-center">
                                        <Label htmlFor="password">{t('password')}</Label>
                                    </div>

                                    <Input
                                        id="password"
                                        type="password"
                                        placeholder={t('passwordPlaceholder')}
                                        autoComplete="current-password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                    />
                                </div>

                                <Button
                                    type="submit"
                                    className="w-full"
                                    disabled={loading}
                                    onClick={handleSignIn}
                                >
                                    {loading ? (
                                        <Loader2 size={16} className="animate-spin" />
                                    ) : (
                                        <p>{t('title')}</p>
                                    )}
                                </Button>
                            </>
                        )}

                        <SocialProviders
                            configs={configs}
                            callbackUrl={callbackUrl}
                            loading={loading}
                            setLoading={setLoading}
                        />
                    </div>
                </CardContent>
                {isEmailAuthEnabled && (
                    <CardFooter>
                        <div className="flex w-full justify-center border-t py-4">
                            <p className="text-center text-xs text-neutral-500">
                                {t('noAccount')}{" "}
                                <Link to={`/sign-up?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="underline cursor-pointer dark:text-white/70">
                                    {t('signUp')}
                                </Link>
                            </p>
                        </div>
                    </CardFooter>
                )}
            </Card>
        </div>
    );
}
