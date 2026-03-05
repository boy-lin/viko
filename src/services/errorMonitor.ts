
import { bridge } from "@/lib/bridge";

// 错误日志服务的接口定义
export interface ErrorLog {
    type: 'js' | 'promise' | 'react' | 'resource' | 'http';
    message: string;
    stack?: string;
    url: string;
    timestamp: number;
    meta?: Record<string, any>;
}

class ErrorMonitor {
    private static instance: ErrorMonitor;
    private logs: ErrorLog[] = [];
    private maxLogs = 50;

    private constructor() {
        this.initGlobalListeners();
    }

    public static getInstance(): ErrorMonitor {
        if (!ErrorMonitor.instance) {
            ErrorMonitor.instance = new ErrorMonitor();
        }
        return ErrorMonitor.instance;
    }

    // 初始化全局监听
    private initGlobalListeners() {
        if (typeof window === 'undefined') return;

        // 捕获 JS 运行时错误
        window.addEventListener('error', (event) => {
            // 区分资源加载错误和JS错误
            if (event.target && (event.target instanceof HTMLElement)) {
                this.log({
                    type: 'resource',
                    message: `Resource load failed: ${(event.target as HTMLElement).tagName}`,
                    url: window.location.href,
                    timestamp: Date.now(),
                    meta: {
                        target: (event.target as HTMLElement).outerHTML
                    }
                });
            } else {
                this.log({
                    type: 'js',
                    message: event.message as string,
                    stack: event.error?.stack,
                    url: window.location.href,
                    timestamp: Date.now(),
                });
            }
        }, true); // Use capture to catch resource errors

        // 捕获未处理的 Promise 拒绝
        window.addEventListener('unhandledrejection', (event) => {
            this.log({
                type: 'promise',
                message: event.reason instanceof Error ? event.reason.message : String(event.reason),
                stack: event.reason instanceof Error ? event.reason.stack : undefined,
                url: window.location.href,
                timestamp: Date.now(),
            });
        });
    }

    // 上报日志
    public log(error: ErrorLog) {
        this.logs.push(error);
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        // 在开发环境打印，生产环境可以上报到服务器
        if (import.meta.env.DEV) {
            console.group('🚨 ErrorMonitor Caught Error:');
            console.log('Type:', error.type);
            console.log('Message:', error.message);
            console.log('Stack:', error.stack);
            console.log('Meta:', error.meta);
            console.groupEnd();
        } else {
            // TODO: 集成 Sentry 或其他日志服务
            // sendToAnalytics(error);
        }

        bridge.reportClientLog({
            level: "error",
            category: error.type,
            message: error.message,
            stack: error.stack,
            url: error.url,
            meta: error.meta,
            timestamp: error.timestamp,
        }).catch((err) => {
            if (import.meta.env.DEV) {
                console.warn("report_client_log failed:", err);
            }
        });
    }

    public getLogs() {
        return this.logs;
    }
}

export const errorMonitor = ErrorMonitor.getInstance();
