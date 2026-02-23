import { Outlet } from 'react-router-dom';
import UpdaterBootstrap from '@/components/app/UpdaterBootstrap';

export default function AuthLayout() {
    return (
        <>
            <UpdaterBootstrap />
            <Outlet />
        </>
    );
}
