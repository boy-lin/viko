import { create } from 'zustand';
import { User } from '@/types/user';

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
            const response = await fetch('/api/user/get-user-info', {
                method: 'POST',
            });

            if (!response.ok) {
                throw new Error('Failed to fetch user info');
            }

            const data = await response.json();
            if (data.code === 0 && data.data) {
                set({ userInfo: data.data, isLoading: false });
            } else {
                throw new Error(data.msg || 'Failed to fetch user info');
            }
        } catch (error) {
            set({ error: (error as Error).message, isLoading: false, userInfo: null });
        }
    },

    setUserInfo: (user) => set({ userInfo: user }),

    clearUser: () => set({ userInfo: null, error: null })
}));
