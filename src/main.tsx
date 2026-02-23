import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "next-themes";
import { analytics } from "@/lib/analytics";
import { Toaster } from 'sonner'
import { ErrorBoundary } from '@/components/error/ErrorBoundary'
import '@/services/errorMonitor'

import "./lib/i18n"; // Import i18n config
import App from "./App";
import "./App.css";
import { initDesktopOAuthDeepLinkListener } from "./lib/desktop-auth";

analytics.init();
void initDesktopOAuthDeepLinkListener();

import "./lib/log";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
    >
      <ErrorBoundary>
        <App />
        <Toaster richColors />
      </ErrorBoundary>
    </ThemeProvider>
  </React.StrictMode>
);
