import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useSession } from '@/lib/auth-client';
import { useUserStore } from '@/stores/user';
import { Loader2 } from 'lucide-react';

export default function AuthLayout() {
    const { data: session, isPending } = useSession();
    const { userInfo, fetchUserInfo } = useUserStore();

    useEffect(() => {
        if (session?.user && !userInfo) {
            fetchUserInfo();
        }
    }, [session, userInfo, fetchUserInfo]);

    if (isPending) {
        return (
            <div className="flex h-screen w-screen items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    // if (!session) {
    //     const callbackUrl = encodeURIComponent(location.pathname + location.search);
    //     return <Navigate to={`/sign-in?callbackUrl=${callbackUrl}`} replace />;
    // }

    return <Outlet />;
}
