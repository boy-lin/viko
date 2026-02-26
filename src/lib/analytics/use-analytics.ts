import { analytics } from './index';

export function useAnalytics() {
    const track = (eventName: string, properties?: Record<string, unknown>) => {
        analytics.track(eventName, properties);
    };

    const identify = (userId: string, properties?: Record<string, unknown>) => {
        analytics.identify(userId, properties);
    };

    const reset = () => {
        analytics.reset();
    };

    return {
        track,
        identify,
        reset,
    };
}
