import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Outlet } from "react-router-dom";
import { bridge } from "@/lib/bridge";
import Sidebar from "./sidebar/Sidebar";
import Header from "./Header";

type SelfCheckResult = {
  ffmpeg_installed: boolean;
  ffprobe_installed: boolean;
  fs_permission: boolean;
};

const Layout: React.FC = () => {
  const [, setChecksPassed] = useState(false);

  useEffect(() => {
    // 判断是否在 Tauri 环境中运行
    if (!bridge.isTauriEvn()) {
      // 普通浏览器环境，跳过自检
      setChecksPassed(true);
      return;
    }

    const check = async () => {
      try {
        const res = await invoke<SelfCheckResult>("run_self_check");
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
      {/* Sidebar */}
      <Sidebar />
      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header />
        {/* Content Area */}
        <div
          className="flex-1 overflow-y-auto px-4 py-2"
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
