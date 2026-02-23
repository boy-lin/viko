import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { getUpdaterGuardStatus, initUpdater, type UpdaterGuardStatus } from "@/lib/updater";

export default function ForceUpdatePage() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<UpdaterGuardStatus | null>(null);

  const lastSuccessText = useMemo(() => {
    if (!status?.lastSuccessAtMs) return "暂无";
    return new Date(status.lastSuccessAtMs).toLocaleString();
  }, [status?.lastSuccessAtMs]);

  const refreshStatus = async () => {
    const next = await getUpdaterGuardStatus();
    setStatus(next);
  };

  useEffect(() => {
    void refreshStatus();
  }, []);

  const handleRetryUpdate = async () => {
    if (loading) return;
    try {
      setLoading(true);
      await initUpdater({ enableForceGuard: true, skipForceGate: true });
      await refreshStatus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border p-6 space-y-4">
        <h1 className="text-lg font-semibold">需要先更新应用</h1>
        <p className="text-sm text-muted-foreground">
          当前网络环境下更新检查多次失败，请先完成更新后再继续使用。
        </p>
        <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
          <p>有效失败次数：{status?.effectiveFailCount ?? "-"}</p>
          <p>最近成功时间：{lastSuccessText}</p>
        </div>
        <Button className="w-full" disabled={loading} onClick={handleRetryUpdate}>
          {loading ? "检查中..." : "重试更新"}
        </Button>
      </div>
    </div>
  );
}
