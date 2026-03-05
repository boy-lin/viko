import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { isTauri } from "@tauri-apps/api/core";
import { bridge, type UpdaterGuardStatus } from "@/lib/bridge";
import { toast } from "sonner";

const UPDATER_META_URL = "https://avi.2342342.xyz/api/app/latest";

type UpdaterMeta = {
  mandatory?: boolean;
  version?: string;
  notes?: string;
};

type InitUpdaterOptions = {
  enableForceGuard?: boolean;
  skipForceGate?: boolean;
  onForceUpdateRequired?: (status: UpdaterGuardStatus) => void;
};

async function fetchUpdaterMeta(): Promise<UpdaterMeta | null> {
  try {
    const resp = await fetch(UPDATER_META_URL, { cache: "no-store" });
    if (!resp.ok) return null;
    const json = (await resp.json()) as UpdaterMeta;
    return json;
  } catch {
    return null;
  }
}

async function updaterGuardGetStatus(): Promise<UpdaterGuardStatus | null> {
  if (!isTauri()) return null;
  try {
    return await bridge.updaterGuardGetStatus();
  } catch {
    return null;
  }
}

export async function getUpdaterGuardStatus(): Promise<UpdaterGuardStatus | null> {
  return updaterGuardGetStatus();
}

async function updaterGuardReportSuccess(): Promise<UpdaterGuardStatus | null> {
  if (!isTauri()) return null;
  try {
    return await bridge.updaterGuardReportSuccess();
  } catch {
    return null;
  }
}

async function updaterGuardReportFailure(reason?: string): Promise<UpdaterGuardStatus | null> {
  if (!isTauri()) return null;
  try {
    return await bridge.updaterGuardReportFailure(reason);
  } catch {
    return null;
  }
}

export async function resetUpdaterGuard() {
  if (!isTauri()) return;
  try {
    await bridge.updaterGuardReset();
  } catch {
    // best effort
  }
}

export async function initUpdater(options: InitUpdaterOptions = {}) {
  if (import.meta.env.DEV) {
    console.warn("Updater is disabled in development mode");
    return;
  }
  if (!isTauri()) return;

  const enableForceGuard = Boolean(options.enableForceGuard);
  const skipForceGate = Boolean(options.skipForceGate);
  try {
    const update = await check();
    if (enableForceGuard) {
      await updaterGuardReportSuccess();
    }

    if (!update?.available) return;

    const meta = await fetchUpdaterMeta();
    const isMandatory = Boolean(meta?.mandatory);
    const startDownload = async () => {
      let id = toast.loading("Updating...");
      try {
        await update.downloadAndInstall();
        await relaunch();
      } catch (error) {
        toast.error("Update failed", {
          id,
          description: "Please try again later.",
        });
        throw error;
      } finally {
        if (id) toast.success("Update success", { id });
      }
    };

    if (isMandatory) {
      await startDownload();
      return;
    }

    const versionLabel = meta?.version ? ` ${meta.version}` : "";
    toast(`New update available${versionLabel}`, {
      description: meta?.notes ?? "Click to download and restart.",
      action: {
        label: "Update",
        onClick: startDownload,
      },
      duration: 15000,
    });
  } catch (error) {
    if (enableForceGuard && !skipForceGate) {
      const status = await updaterGuardReportFailure(
        error instanceof Error ? error.message : String(error),
      );
      if (status?.shouldForceUpdate) {
        options.onForceUpdateRequired?.(status);
        return;
      }
    }
    console.error("Updater check failed:" + JSON.stringify(error));
  }
}