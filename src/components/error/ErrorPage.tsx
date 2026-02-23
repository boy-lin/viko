import React, { useEffect } from 'react';
import { AlertTriangle, Home, RotateCcw } from 'lucide-react';
import { useNavigate, useInRouterContext, useRouteError } from 'react-router-dom';
// import { errorMonitor } from '@/services/errorMonitor';

interface ErrorPageProps {
    error?: Error | null;
    resetErrorBoundary?: () => void;
    title?: string;
    message?: string;
}

const ErrorPage: React.FC<ErrorPageProps> = ({
    error: propError,
    resetErrorBoundary,
    title = "页面正如流星般坠落...",
    message = "抱歉，应用程序遇到了意外错误。"
}) => {
    // 安全地尝试获取导航 hook
    const inRouter = useInRouterContext();
    const navigate = inRouter ? useNavigate() : null;

    // 获取路由错误（如果有）
    const routeError = inRouter ? useRouteError() as Error : null;

    // 优先使用传入的 error，其次是路由错误
    const error = propError || routeError;

    // 如果通过路由捕获到错误，手动上报日志
    useEffect(() => {
        if (routeError && !propError) {
            console.error("Route Error Caught:", routeError);
            // errorMonitor.log({
            //     type: 'react',
            //     message: routeError.message || String(routeError),
            //     stack: routeError.stack,
            //     url: window.location.href,
            //     timestamp: Date.now(),
            //     meta: {
            //         source: 'ReactRouter'
            //     }
            // });
        }
    }, [routeError, propError]);

    const handleRetry = () => {
        if (resetErrorBoundary) {
            resetErrorBoundary();
        } else {
            window.location.reload();
        }
    };

    const handleHome = () => {
        if (resetErrorBoundary) {
            resetErrorBoundary();
        }

        if (navigate) {
            navigate('/');
        } else {
            window.location.href = '/';
        }
    };

    return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gray-50 p-4 text-center">
            <div className="max-w-md w-full bg-background rounded-2xl p-8">
                <div className="mx-auto w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-6 animate-pulse">
                    <AlertTriangle className="w-8 h-8 text-red-500" />
                </div>

                <h1 className="text-2xl font-bold text-gray-900 mb-2">
                    {title}
                </h1>

                <p className="text-gray-500 mb-8 leading-relaxed">
                    {message}
                </p>

                {error && import.meta.env.DEV && (
                    <div className="mb-8 p-4 bg-gray-100 rounded-lg overflow-auto max-h-48">
                        <p className="text-xs font-mono text-red-600 font-semibold mb-1">
                            {error?.message || String(error) || 'Unknown Error'}
                        </p>
                        {/* <code className="text-xs text-gray-700 font-mono break-all block mb-2">
                            {error?.message || String(error) || 'Unknown Error'}
                        </code> */}
                        {/* {error?.stack && (
                            <>
                                <p className="text-xs font-mono text-red-600 font-semibold mb-1">Stack Trace:</p>
                                <pre className="text-[10px] text-gray-500 font-mono overflow-auto whitespace-pre-wrap">
                                    {error.stack}
                                </pre>
                            </>
                        )} */}
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                    <button
                        onClick={handleHome}
                        className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gray-100 text-gray-700 font-medium hover:bg-gray-200 transition-colors active:scale-95"
                    >
                        <Home className="w-4 h-4" />
                        返回首页
                    </button>

                    <button
                        onClick={handleRetry}
                        className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-gray-900 text-white font-medium hover:bg-gray-800 transition-colors shadow-lg shadow-gray-200 active:scale-95"
                    >
                        <RotateCcw className="w-4 h-4" />
                        刷新页面
                    </button>
                </div>
            </div>

            <p className="mt-8 text-xs text-gray-400">
                Error Code: 500 | System Crash
            </p>
        </div>
    );
};

export default ErrorPage;
