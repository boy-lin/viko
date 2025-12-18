import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Outlet } from "react-router-dom";
import SelfCheck from "./SelfCheck";
import { Navbar } from "./Navbar";
import { bridge } from "@/lib/bridge";

type SelfCheckResult = {
  ffmpeg_installed: boolean;
  ffprobe_installed: boolean;
  fs_permission: boolean;
};

const Layout: React.FC = () => {
  const [selfCheckVisible, setSelfCheckVisible] = useState(false);
  const [, setChecksPassed] = useState(false);

  useEffect(() => {
    // 判断是否在 Tauri 环境中运行
    if (!bridge.isTauriEvn()) {
      // 普通浏览器环境，跳过自检
      setChecksPassed(true);
      setSelfCheckVisible(false);
      return;
    }

    const check = async () => {
      try {
        const res = await invoke<SelfCheckResult>("run_self_check");
        if (
          res.ffmpeg_installed &&
          res.ffprobe_installed &&
          res.fs_permission
        ) {
          setChecksPassed(true);
          setSelfCheckVisible(false);
        } else {
          setChecksPassed(false);
          setSelfCheckVisible(true);
        }
      } catch (err) {
        console.error("self check failed", err);
        setChecksPassed(false);
        setSelfCheckVisible(true);
      }
    };
    check();
  }, []);

  return (
    <div className="h-full bg-background text-foreground">
      <Navbar />
      <Outlet />
      {selfCheckVisible && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center">
          <div className="w-full h-full md:h-auto md:max-w-5xl md:max-h-[90vh] overflow-auto md:rounded-2xl md:border md:border-black/10 md:bg-black/50">
            <SelfCheck
              onPassed={() => {
                setChecksPassed(true);
                setSelfCheckVisible(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
