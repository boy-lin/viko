import React, { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { useAnalytics } from "@/lib/analytics/use-analytics";
import { bridge } from "@/lib/bridge";
import Sidebar from "./sidebar/Sidebar";
import Header from "./Header";

const Layout: React.FC = () => {
  const [, setChecksPassed] = useState(false);
  const { track } = useAnalytics();

  useEffect(() => {
    if (!bridge.isTauri()) {
      setChecksPassed(true);
      return;
    }

    const check = async () => {
      try {
        const res = await bridge.runSelfCheck();
        console.log("run_self_check res", res);
      } catch (err) {
        console.error("self check failed", err);
        setChecksPassed(false);
      }
    };
    check();
    track("page_view", { page: "home" });
  }, []);

  return (
    <div
      className="flex h-screen bg-background text-foreground overscroll-none"
      style={{
        overscrollBehavior: "none",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 py-2 min-h-0">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;