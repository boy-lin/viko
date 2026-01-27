import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

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
    const navigate = useNavigate();
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
            toast.error('Email and password are required');
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
                    navigate(callbackUrl);
                },
                onError: (ctx) => {
                    toast.error(ctx.error.message || 'Sign in failed');
                    setLoading(false);
                },
            }
        );
    };

    return (
        <div className="flex items-center justify-center min-h-screen p-4 bg-muted/50">
            <Card className="mx-auto w-full md:max-w-md">
                <CardHeader>
                    <CardTitle className="text-lg md:text-xl">
                        <h1>Sign In</h1>
                    </CardTitle>
                    <CardDescription className="text-xs md:text-sm">
                        <h2>Enter your credentials to access your account</h2>
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4">
                        {isEmailAuthEnabled && (
                            <>
                                <div className="grid gap-2">
                                    <Label htmlFor="email">Email</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="name@example.com"
                                        required
                                        onChange={(e) => setEmail(e.target.value)}
                                        value={email}
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <div className="flex items-center">
                                        <Label htmlFor="password">Password</Label>
                                    </div>

                                    <Input
                                        id="password"
                                        type="password"
                                        placeholder="Last passsword"
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
                                        <p>Sign In</p>
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
                                Don&apos;t have an account?{" "}
                                <Link to={`/sign-up?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="underline cursor-pointer dark:text-white/70">
                                    Sign Up
                                </Link>
                            </p>
                        </div>
                    </CardFooter>
                )}
            </Card>
        </div>
    );
}
