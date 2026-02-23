import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { toast } from "sonner";

const UPDATER_META_URL = "https://avi.2342342.xyz/api/app/latest";

type UpdaterMeta = {
  mandatory?: boolean;
  version?: string;
  notes?: string;
};

export type UpdaterGuardStatus = {
  shouldForceUpdate: boolean;
  effectiveFailCount: number;
  lastSuccessAtMs?: number | null;
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
    return await invoke<UpdaterGuardStatus>("updater_guard_get_status");
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
    return await invoke<UpdaterGuardStatus>("updater_guard_report_success");
  } catch {
    return null;
  }
}

async function updaterGuardReportFailure(reason?: string): Promise<UpdaterGuardStatus | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<UpdaterGuardStatus>("updater_guard_report_failure", { reason });
  } catch {
    return null;
  }
}

export async function resetUpdaterGuard() {
  if (!isTauri()) return;
  try {
    await invoke("updater_guard_reset");
  } catch {
    // best effort
  }
}

export async function initUpdater(options: InitUpdaterOptions = {}) {
  if (!isTauri()) return;
  const enableForceGuard = Boolean(options.enableForceGuard);
  const skipForceGate = Boolean(options.skipForceGate);

  if (enableForceGuard && !skipForceGate) {
    const currentStatus = await updaterGuardGetStatus();
    if (currentStatus?.shouldForceUpdate) {
      options.onForceUpdateRequired?.(currentStatus);
      return;
    }
  }

  try {
    const update = await check();
    if (enableForceGuard) {
      await updaterGuardReportSuccess();
    }

    if (!update?.available) return;

    const meta = await fetchUpdaterMeta();
    const isMandatory = Boolean(meta?.mandatory);

    if (isMandatory) {
      await update.downloadAndInstall();
      await relaunch();
      return;
    }

    const versionLabel = meta?.version ? ` ${meta.version}` : "";
    toast(`New update available${versionLabel}`, {
      description: meta?.notes ?? "Click to download and restart.",
      action: {
        label: "Update",
        onClick: async () => {
          try {
            await update.downloadAndInstall();
            await relaunch();
          } catch (error) {
            console.error("Failed to install update:", error);
            toast("Update failed", {
              description: "Please try again later.",
            });
          }
        },
      },
      duration: 15000,
    });
  } catch (error) {
    if (enableForceGuard) {
      const status = await updaterGuardReportFailure(
        error instanceof Error ? error.message : String(error)
      );
      if (status?.shouldForceUpdate) {
        options.onForceUpdateRequired?.(status);
        return;
      }
    }
    console.error("Updater check failed:" + JSON.stringify(error));
  }
}
