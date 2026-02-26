import { AnalyticsProvider } from './types';

const GA_ID = import.meta.env.VITE_GOOGLE_ANALYTICS_ID || '';

declare global {
    interface Window {
        dataLayer: unknown[];
        gtag: (...args: unknown[]) => void;
    }
}

export class GoogleAnalyticsProvider implements AnalyticsProvider {
    name = 'google-analytics';

    init() {
        if (!GA_ID) {
            console.warn('Google Analytics ID not found. Analytics will not be sent.');
            return;
        }

        // Prevent duplicate injection
        if (document.getElementById('ga-script')) return;

        // Inject Google Tag Manager script
        const script = document.createElement('script');
        script.id = 'ga-script';
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
        document.head.appendChild(script);

        // Initialize dataLayer
        window.dataLayer = window.dataLayer || [];
        function gtag(...args: unknown[]) {
            window.dataLayer.push(args);
        }
        window.gtag = gtag;

        gtag('js', new Date());
        gtag('config', GA_ID);
    }

    track(eventName: string, properties?: Record<string, unknown>) {
        if (typeof window.gtag === 'function') {
            window.gtag('event', eventName, properties);
        }
    }

    identify(userId: string, properties?: Record<string, unknown>) {
        if (typeof window.gtag === 'function') {
            window.gtag('set', 'user_properties', { ...properties, user_id: userId });
            // GA4 config update for user_id
            window.gtag('config', GA_ID, {
                user_id: userId,
            });
        }
    }

    reset() {
        // GA doesn't have a specific reset/logout method exposed easily in gtag
        // but we can potentially clear user properties if needed
    }
}
