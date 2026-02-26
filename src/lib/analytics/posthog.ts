import posthog from 'posthog-js';
import { AnalyticsProvider } from './types';

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY || 'phc_placeholder_key';
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

export class PostHogAnalyticsProvider implements AnalyticsProvider {
    name = 'posthog';

    init() {
        if (POSTHOG_KEY === 'phc_placeholder_key') {
            console.warn('PostHog API Key not found. Analytics will not be sent.');
            return;
        }

        posthog.init(POSTHOG_KEY, {
            api_host: POSTHOG_HOST,
            person_profiles: 'identified_only', // or 'always' to create profiles for anonymous users as well
        });
    }

    track(eventName: string, properties?: Record<string, unknown>) {
        posthog.capture(eventName, properties);
    }

    identify(userId: string, properties?: Record<string, unknown>) {
        posthog.identify(userId, properties);
    }

    reset() {
        posthog.reset();
    }
}
