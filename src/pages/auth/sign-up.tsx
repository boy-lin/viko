import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { signUp } from '@/lib/auth-client';
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

export default function SignUpPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const callbackUrl = searchParams.get('callbackUrl') || '/';

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const configs = { email_auth_enabled: 'true', google_auth_enabled: 'true', github_auth_enabled: 'true' };
    const isEmailAuthEnabled = configs.email_auth_enabled !== 'false';

    const handleSignUp = async () => {
        if (loading) return;

        if (!email || !password || !name) {
            toast.error('Name, email and password are required');
            return;
        }

        await signUp.email(
            {
                email,
                password,
                name,
            },
            {
                onRequest: () => setLoading(true),
                onResponse: () => setLoading(false),
                onSuccess: () => {
                    navigate(callbackUrl);
                },
                onError: (ctx) => {
                    toast.error(ctx.error.message || 'Sign up failed');
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
                        <h1>Sign Up</h1>
                    </CardTitle>
                    <CardDescription className="text-xs md:text-sm">
                        <h2>Create an account to get started</h2>
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4">
                        {isEmailAuthEnabled && (
                            <>
                                <div className="grid gap-2">
                                    <Label htmlFor="name">Name</Label>
                                    <Input
                                        id="name"
                                        type="text"
                                        placeholder="Your Name"
                                        required
                                        onChange={(e) => setName(e.target.value)}
                                        value={name}
                                    />
                                </div>

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
                                    <Label htmlFor="password">Password</Label>
                                    <Input
                                        id="password"
                                        type="password"
                                        placeholder="Create a password"
                                        autoComplete="new-password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                    />
                                </div>

                                <Button
                                    type="submit"
                                    className="w-full"
                                    disabled={loading}
                                    onClick={handleSignUp}
                                >
                                    {loading ? (
                                        <Loader2 size={16} className="animate-spin" />
                                    ) : (
                                        <p>Sign Up</p>
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
                                Already have an account?{" "}
                                <Link to={`/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`} className="underline cursor-pointer dark:text-white/70">
                                    Sign In
                                </Link>
                            </p>
                        </div>
                    </CardFooter>
                )}
            </Card>
        </div>
    );
}
