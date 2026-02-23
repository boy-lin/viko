import { create } from 'zustand';
import { User } from '@/types/user';
import { getUserInfoApi } from '@/services/user-api';
import { getDesktopUserFromToken } from '@/lib/desktop-auth';

interface UserState {
    userInfo: User | null;
    isLoading: boolean;
    isProfileRefreshing: boolean;
    isTokenPreview: boolean;
    error: string | null;
    fetchUserInfo: () => Promise<void>;
    clearUser: () => void;
    setUserInfo: (user: User) => void;
}

export const useUserStore = create<UserState>((set) => ({
    userInfo: null,
    isLoading: false,
    isProfileRefreshing: false,
    isTokenPreview: false,
    error: null,

    fetchUserInfo: async () => {
        const tokenUser = getDesktopUserFromToken();
        if (tokenUser) {
            set({
                userInfo: tokenUser,
                isTokenPreview: true,
                isProfileRefreshing: true,
                isLoading: true,
                error: null,
            });
        } else {
            set({ isLoading: true, isProfileRefreshing: false, error: null });
        }
        try {
            const user = await getUserInfoApi();
            set({
                userInfo: user,
                isLoading: false,
                isProfileRefreshing: false,
                isTokenPreview: false,
            });
        } catch (error) {
            set({
                error: (error as Error).message,
                isLoading: false,
                isProfileRefreshing: false,
                userInfo: tokenUser || null,
                isTokenPreview: Boolean(tokenUser),
            });
            throw error;
        }
    },

    setUserInfo: (user) => set({ userInfo: user, isTokenPreview: false, isProfileRefreshing: false }),

    clearUser: () => set({ userInfo: null, error: null, isTokenPreview: false, isProfileRefreshing: false })
}));
