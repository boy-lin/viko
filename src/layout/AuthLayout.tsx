import { Outlet } from 'react-router-dom';
import { useSession } from '@/lib/auth-client';
import { useUserStore } from '@/stores/user';
import { useEffect } from 'react';

export default function AuthLayout() {
    const { data: session } = useSession();
    const { userInfo, fetchUserInfo } = useUserStore();

    useEffect(() => {
        if (session?.user && !userInfo) {
            fetchUserInfo();
        }
    }, [session, userInfo, fetchUserInfo]);

    return <Outlet />;
}
