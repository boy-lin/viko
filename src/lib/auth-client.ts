import { createAuthClient } from 'better-auth/react';
import { baseApiUrl } from './env';

export const authClient = createAuthClient({
    baseURL: baseApiUrl + "/api/auth",
});

export const { signIn, signUp, useSession, signOut } = authClient;
