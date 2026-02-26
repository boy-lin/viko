import { AnalyticsProvider } from './types';
import { PostHogAnalyticsProvider } from './posthog';
import { GoogleAnalyticsProvider } from './google-analytics';
import { bridge } from '@/lib/bridge';
import pkg from '../../../package.json';

const DEVICE_ID_STORAGE_KEY = 'analytics_device_id';

type AnalyticsContext = {
    device_id: string;
    app_version: string;
    user_id?: string;
};

const createFallbackDeviceId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `web-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

class AnalyticsService {
    private providers: AnalyticsProvider[] = [];
    private context: AnalyticsContext = {
        device_id: createFallbackDeviceId(),
        app_version: pkg.version,
    };

    init() {
        this.providers = [
            new PostHogAnalyticsProvider(),
            new GoogleAnalyticsProvider(),
        ];

        this.providers.forEach(provider => provider.init());
        this.bootstrapContext();
    }

    private bootstrapContext() {
        if (typeof window !== 'undefined') {
            const cachedDeviceId = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
            if (cachedDeviceId) {
                this.context.device_id = cachedDeviceId;
            } else {
                window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, this.context.device_id);
            }
        }

        void bridge.getDeviceId().then((deviceId) => {
            if (!deviceId) return;
            this.context.device_id = deviceId;
            if (typeof window !== 'undefined') {
                window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
            }
        }).catch(() => {
            // keep fallback ID
        });
    }

    private withContext(properties?: Record<string, unknown>): Record<string, unknown> {
        return {
            ...this.context,
            ...properties,
        };
    }

    track(eventName: string, properties?: Record<string, unknown>) {
        const payload = this.withContext(properties);
        this.providers.forEach(provider => provider.track(eventName, payload));
    }

    identify(userId: string, properties?: Record<string, unknown>) {
        this.context.user_id = userId;
        const payload = this.withContext(properties);
        this.providers.forEach(provider => provider.identify(userId, payload));
    }

    reset() {
        delete this.context.user_id;
        this.providers.forEach(provider => provider.reset());
    }
}

export const analytics = new AnalyticsService();
export * from './use-analytics';
