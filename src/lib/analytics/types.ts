export interface AnalyticsProvider {
    name: string;
    init: () => void;
    track: (eventName: string, properties?: Record<string, unknown>) => void;
    identify: (userId: string, properties?: Record<string, unknown>) => void;
    reset: () => void;
}
