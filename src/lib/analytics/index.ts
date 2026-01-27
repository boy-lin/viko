import { AnalyticsProvider } from './types';
import { PostHogAnalyticsProvider } from './posthog';
import { GoogleAnalyticsProvider } from './google-analytics';

class AnalyticsService {
    private providers: AnalyticsProvider[] = [];

    init() {
        this.providers = [
            new PostHogAnalyticsProvider(),
            new GoogleAnalyticsProvider(),
        ];

        this.providers.forEach(provider => provider.init());
    }

    track(eventName: string, properties?: Record<string, any>) {
        this.providers.forEach(provider => provider.track(eventName, properties));
    }

    identify(userId: string, properties?: Record<string, any>) {
        this.providers.forEach(provider => provider.identify(userId, properties));
    }

    reset() {
        this.providers.forEach(provider => provider.reset());
    }
}

export const analytics = new AnalyticsService();
export * from './use-analytics';
