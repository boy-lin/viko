export interface User {
    id: string;
    name: string;
    email: string;
    image?: string;
    role?: string;
    isAdmin?: boolean;
    credits?: {
        remainingCredits: number;
    };
    emailVerified?: boolean;
    createdAt?: string;
    updatedAt?: string;
}
