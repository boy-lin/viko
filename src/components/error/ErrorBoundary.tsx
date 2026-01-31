
import { Component, ErrorInfo, ReactNode } from 'react';
import ErrorPage from './ErrorPage';
// import { errorMonitor } from '@/services/errorMonitor';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            hasError: false,
            error: null
        };
    }

    public static getDerivedStateFromError(error: Error): State {
        // 更新 state 使下一次渲染能够显示降级后的 UI
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        // 你同样可以将错误日志上报给服务器
        console.error("1 Uncaught error:", { error, errorInfo });

        // 使用我们的监控服务记录 React 错误
        // errorMonitor.log({
        //     type: 'react',
        //     message: error.message,
        //     stack: error.stack,
        //     url: window.location.href,
        //     timestamp: Date.now(),
        //     meta: {
        //         componentStack: errorInfo.componentStack
        //     }
        // });
    }

    private handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <ErrorPage
                    error={this.state.error}
                    resetErrorBoundary={this.handleReset}
                />
            );
        }

        return this.props.children;
    }
}
