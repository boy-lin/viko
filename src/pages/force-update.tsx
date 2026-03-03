import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { getUpdaterGuardStatus, initUpdater, type UpdaterGuardStatus } from "@/lib/updater";

export default function ForceUpdatePage() {
  const { t } = useTranslation("common");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<UpdaterGuardStatus | null>(null);

  const lastSuccessText = useMemo(() => {
    if (!status?.lastSuccessAtMs) return t("force_update.status.none", "暂无");
    return new Date(status.lastSuccessAtMs).toLocaleString();
  }, [status?.lastSuccessAtMs, t]);

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
        <h1 className="text-lg font-semibold">{t("force_update.title", "更新应用")}</h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "force_update.description",
            "当前版本应用已经不在维护，请先完成更新后继续使用。",
          )}
        </p>
        <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
          <p>
            {t("force_update.status.effective_fail_count", "有效失败次数")}：
            {status?.effectiveFailCount ?? "-"}
          </p>
          <p>
            {t("force_update.status.last_success_time", "最近成功时间")}：
            {lastSuccessText}
          </p>
        </div>
        <Button className="w-full" disabled={loading} onClick={handleRetryUpdate}>
          {loading
            ? t("force_update.actions.checking", "检查中...")
            : t("force_update.actions.retry_update", "重试更新")}
        </Button>
      </div>
    </div>
  );
}
