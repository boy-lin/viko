import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
    baseURL: "https://avi.2342342.xyz/api/auth",
});

export const { signIn, signUp, useSession, signOut } = authClient;
