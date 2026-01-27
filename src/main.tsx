import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "next-themes";
import { analytics } from "@/lib/analytics";
import { Toaster } from 'sonner'
// import { ErrorBoundary } from '@/components/error/ErrorBoundary'
// import '@/services/errorMonitor' 

import App from "./App";
import "./App.css";

analytics.init();

import "./lib/log";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
    >
      {/* <ErrorBoundary> */}
      <App />
      <Toaster />
      {/* </ErrorBoundary> */}
    </ThemeProvider>
  </React.StrictMode>
);
