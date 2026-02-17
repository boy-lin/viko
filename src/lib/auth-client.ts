import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
    baseURL: import.meta.env.VITE_BASE_API_URL + "/api/auth",
});

export const { signIn, signUp, useSession, signOut } = authClient;
