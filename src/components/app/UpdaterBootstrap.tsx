import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { initUpdater } from "@/lib/updater";

export function UpdaterBootstrap() {
  const navigate = useNavigate();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    void initUpdater({
      enableForceGuard: true,
      onForceUpdateRequired: () => {
        navigate("/force-update", { replace: true });
      },
    });
  }, [navigate]);

  return null;
}

export default UpdaterBootstrap;
