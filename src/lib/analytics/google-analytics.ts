import ReactGA from "react-ga4";
import { AnalyticsProvider } from "./types";

const GA_ID = import.meta.env.VITE_GOOGLE_ANALYTICS_ID || "";

export class GoogleAnalyticsProvider implements AnalyticsProvider {
  name = "google-analytics";
  private ready = false;

  init() {
    if (!GA_ID) {
      console.warn("Google Analytics ID not found. Analytics will not be sent.");
      return;
    }

    ReactGA.initialize([
      {
        trackingId: GA_ID,
        gaOptions: {
          send_page_view: false,
        },
      },
    ]);

    this.ready = true;
  }

  setContext(properties?: Record<string, unknown>) {
    if (!this.ready || !properties) return;

    ReactGA.set(properties);

    const userProperties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(properties)) {
      if (value !== undefined) {
        userProperties[key] = value;
      }
    }
    if (Object.keys(userProperties).length > 0) {
      ReactGA.gtag("set", "user_properties", userProperties);
    }
  }

  track(eventName: string, properties?: Record<string, unknown>) {
    if (!this.ready) return;

    ReactGA.event(eventName, properties);
  }

  identify(userId: string, properties?: Record<string, unknown>) {
    if (!this.ready) return;

    this.setContext({
      ...(properties ?? {}),
      user_id: userId,
    });
  }

  reset() {
    if (!this.ready) return;

    ReactGA.set({
      user_id: undefined,
    });
    ReactGA.gtag("set", "user_properties", {});
  }
}
