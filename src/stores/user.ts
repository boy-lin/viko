import { create } from 'zustand';
import { User } from '@/types/user';
import { getUserInfoApi } from '@/services/user-api';

interface UserState {
    userInfo: User | null;
    isLoading: boolean;
    error: string | null;
    fetchUserInfo: () => Promise<void>;
    clearUser: () => void;
    setUserInfo: (user: User) => void;
}

export const useUserStore = create<UserState>((set) => ({
    userInfo: null,
    isLoading: false,
    error: null,

    fetchUserInfo: async () => {
        set({ isLoading: true, error: null });
        try {
            const user = await getUserInfoApi();
            set({ userInfo: user, isLoading: false });
        } catch (error) {
            set({ error: (error as Error).message, isLoading: false, userInfo: null });
        }
    },

    setUserInfo: (user) => set({ userInfo: user }),

    clearUser: () => set({ userInfo: null, error: null })
}));
