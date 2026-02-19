import { Outlet } from 'react-router-dom';
import { useSession } from '@/lib/auth-client';
import { useUserStore } from '@/stores/user';
import { useEffect } from 'react';
import { analytics } from '@/lib/analytics';

export default function AuthLayout() {
    const { data: session } = useSession();
    const { userInfo, fetchUserInfo } = useUserStore();

    useEffect(() => {
        if (session?.user && !userInfo) {
            fetchUserInfo();
        }
    }, [session, userInfo, fetchUserInfo]);

    useEffect(() => {
        if (session?.user?.id) {
            analytics.identify(session.user.id, {
                email: session.user.email,
                name: session.user.name,
            });
        }
    }, [session?.user?.id, session?.user?.email, session?.user?.name]);

    return <Outlet />;
}
