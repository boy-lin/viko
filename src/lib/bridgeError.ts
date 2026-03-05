import type { BridgeInvokeError } from "@/lib/bridge";

function asBridgeInvokeError(error: unknown): BridgeInvokeError {
  return (error as BridgeInvokeError) ?? {};
}

export function getBridgeErrorMessage(
  error: unknown,
  fallback = "操作失败，请稍后重试",
): string {
  const e = asBridgeInvokeError(error);
  const code = e.code || "";
  const message = e.message || "";

  if (code === "TASK_CANCEL") return "任务取消失败，请稍后重试";
  if (code === "TASK_CLEAR") return "清空任务队列失败，请稍后重试";
  if (code === "TASK_SUBMIT") return "任务提交失败，请检查输入参数后重试";
  if (code === "NETWORK") return "网络异常，请检查网络连接后重试";
  if (code === "HTTP") return message || "服务端返回异常，请稍后重试";
  if (code === "PARAM") return message || "参数错误，请检查后重试";
  if (code === "PARSE") return "响应解析失败，请稍后重试";
  if (code === "PLAYER") return message || "播放器操作失败，请重试";
  if (code === "THUMBNAIL") return message || "缩略图生成失败，请稍后重试";
  if (code === "JOIN") return "后台任务执行异常，请稍后重试";
  if (code === "INVOKE_ERROR") return message || fallback;

  return message || fallback;
}
