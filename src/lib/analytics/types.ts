export interface AnalyticsProvider {
    name: string;
    init: () => void;
    track: (eventName: string, properties?: Record<string, any>) => void;
    identify: (userId: string, properties?: Record<string, any>) => void;
    reset: () => void;
}
