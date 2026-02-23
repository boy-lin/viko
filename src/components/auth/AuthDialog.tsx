import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  clearDesktopOAuthSession,
  finishDesktopOAuthLogin,
  isDesktopOAuthAvailable,
  startDesktopOAuthLogin,
} from "@/lib/desktop-auth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

type AuthDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

type LoginPhase =
  | "idle"
  | "opening"
  | "pending_callback"
  | "exchanging"
  | "success"
  | "timeout"
  | "error";

type DesktopAuthErrorDetail = {
  code: string;
  message: string;
};

const CALLBACK_TIMEOUT_MS = 90_000;
const CALLBACK_TIMEOUT_SECONDS = CALLBACK_TIMEOUT_MS / 1000;

export const AuthDialog = ({ open, onOpenChange, onSuccess }: AuthDialogProps) => {
  const [phase, setPhase] = useState<LoginPhase>("idle");
  const [desktopCode, setDesktopCode] = useState("");
  const [lastError, setLastError] = useState<string>("");
  const [remainingSeconds, setRemainingSeconds] = useState<number>(CALLBACK_TIMEOUT_SECONDS);
  const desktopOauthEnabled = isDesktopOAuthAvailable();
  const debugManualInputEnabled = true;
  const loading = phase === "opening" || phase === "exchanging";
  const pending = phase === "pending_callback";
  const canStart = phase === "idle" || phase === "timeout" || phase === "error";
  const pendingText = useMemo(() => {
    if (phase === "exchanging") {
      return "已收到回调，正在完成登录...";
    }
    if (phase === "pending_callback") {
      return "请在浏览器完成授权，应用会自动登录";
    }
    if (phase === "timeout") {
      return "长时间未收到回调，你可以重试登录";
    }
    return "";
  }, [phase]);
  const countdownProgress = useMemo(() => {
    const consumed = CALLBACK_TIMEOUT_SECONDS - remainingSeconds;
    const ratio = Math.min(100, Math.max(0, (consumed / CALLBACK_TIMEOUT_SECONDS) * 100));
    return ratio;
  }, [remainingSeconds]);

  const handleSuccess = () => {
    setPhase("success");
    onOpenChange(false);
    onSuccess?.();
  };

  const handleDesktopOAuthStart = async () => {
    if (!canStart) return;
    try {
      setLastError("");
      setPhase("opening");
      setRemainingSeconds(CALLBACK_TIMEOUT_SECONDS);
      await startDesktopOAuthLogin();
      setPhase("pending_callback");
      toast.success("已打开浏览器，请完成授权");
    } catch (error) {
      setPhase("error");
      const message = (error as Error).message || "打开网页登录失败";
      setLastError(message);
      toast.error(message);
    }
  };

  const handleDesktopOAuthFinish = async () => {
    if (loading) return;
    if (!desktopCode.trim()) {
      toast.error("请先输入授权 code");
      return;
    }
    try {
      setPhase("exchanging");
      await finishDesktopOAuthLogin(desktopCode.trim());
      setDesktopCode("");
      handleSuccess();
      toast.success("登录成功");
    } catch (error) {
      const message = (error as Error).message || "桌面登录失败";
      setLastError(message);
      setPhase("error");
      toast.error(message);
    }
  };

  const handleCancel = () => {
    clearDesktopOAuthSession();
    setDesktopCode("");
    setLastError("");
    setRemainingSeconds(CALLBACK_TIMEOUT_SECONDS);
    setPhase("idle");
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    setPhase("idle");
    setLastError("");
    setRemainingSeconds(CALLBACK_TIMEOUT_SECONDS);
  }, [open]);

  useEffect(() => {
    if (!open || !pending) {
      return;
    }
    const timer = window.setTimeout(() => {
      setPhase("timeout");
      setLastError("授权超时，请点击重试");
    }, CALLBACK_TIMEOUT_MS);
    const countdownTimer = window.setInterval(() => {
      setRemainingSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(countdownTimer);
    };
  }, [open, pending]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onExchanging = () => {
      setLastError("");
      setPhase("exchanging");
    };
    const onSuccess = () => {
      setDesktopCode("");
      setLastError("");
      handleSuccess();
    };
    const onError = (event: Event) => {
      const detail = (event as CustomEvent<DesktopAuthErrorDetail>).detail;
      const message = detail?.message || "桌面登录失败";
      setLastError(message);
      setPhase("error");
      toast.error(message);
    };
    window.addEventListener("desktop-auth:exchanging", onExchanging);
    window.addEventListener("desktop-auth:success", onSuccess);
    window.addEventListener("desktop-auth:error", onError as EventListener);
    return () => {
      window.removeEventListener("desktop-auth:exchanging", onExchanging);
      window.removeEventListener("desktop-auth:success", onSuccess);
      window.removeEventListener("desktop-auth:error", onError as EventListener);
    };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">登录</DialogTitle>
        </DialogHeader>
        {desktopOauthEnabled && (
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full"
              disabled={loading || !canStart}
              onClick={handleDesktopOAuthStart}
            >
              {phase === "timeout" || phase === "error" ? "重新发起浏览器登录" : "使用浏览器登录"}
            </Button>
            {(phase === "opening" || phase === "exchanging") && (
              <div className="flex items-center text-sm text-muted-foreground gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {pendingText || "处理中..."}
              </div>
            )}
            {pendingText && phase !== "opening" && phase !== "exchanging" && (
              <p className="text-sm text-muted-foreground">{pendingText}</p>
            )}
            {pending && (
              <div className="space-y-1">
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-1000"
                    style={{ width: `${countdownProgress}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">剩余 {remainingSeconds}s</p>
              </div>
            )}
            {(pending || loading) && (
              <Button variant="ghost" className="w-full" disabled={loading} onClick={handleCancel}>
                取消本次登录
              </Button>
            )}
            {debugManualInputEnabled && (
              <>
                <Input
                  placeholder="调试：粘贴授权/回调 URL 或 code"
                  value={desktopCode}
                  onChange={(e) => setDesktopCode(e.target.value)}
                  disabled={loading}
                />
                <Button
                  className="w-full"
                  disabled={loading || !desktopCode.trim()}
                  onClick={handleDesktopOAuthFinish}
                >
                  调试提交 URL/code
                </Button>
              </>
            )}
            {lastError && phase === "error" && (
              <p className="text-sm text-red-500">{lastError}</p>
            )}
          </div>
        )}
        {!desktopOauthEnabled && (
          <p className="text-sm text-muted-foreground">
            当前环境未启用 Desktop OAuth，请检查 OAuth 环境变量配置。
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AuthDialog;
