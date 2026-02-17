import { createAuthClient } from 'better-auth/react';


console.log(
    'import.meta.env.VITE_BASE_API_URL',
    import.meta.env.VITE_BASE_API_URL
);

export const authClient = createAuthClient({
    baseURL: import.meta.env.VITE_BASE_API_URL + "/api/auth",
});

export const { signIn, signUp, useSession, signOut } = authClient;
