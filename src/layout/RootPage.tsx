import React, { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { bridge } from "@/lib/bridge";
import Sidebar from "./sidebar/Sidebar";
import Header from "./Header";

const Layout: React.FC = () => {
  const [, setChecksPassed] = useState(false);

  useEffect(() => {
    if (!bridge.isTauriEvn()) {
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
        <div
          className="flex-1 overflow-y-auto py-2"
          style={{
            WebkitOverflowScrolling: "touch",
            overscrollBehaviorY: "auto",
          }}
        >
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;