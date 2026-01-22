import { getCurrentWebview } from "@tauri-apps/api/webview";

type DragEventType = "over" | "enter" | "drop" | "leave" | "cancel";

type DragEventPayload = {
  type: DragEventType;
  paths?: string[];
  position?: { x: number; y: number };
};

type DragEventCallback = (payload: DragEventPayload) => void;

class DragDropManager {
  private unlisten: (() => void) | null = null;
  private isListening = false;
  // 使用 Map 存储 key -> callback 的映射
  private callbacks: Map<string, DragEventCallback> = new Map();
  private isDragging = false;
  private debug = false; // 调试模式开关
  // 防止并发创建监听器的 Promise
  private listeningPromise: Promise<void> | null = null;

  /**
   * 启用/禁用调试模式
   */
  setDebug(enabled: boolean) {
    this.debug = enabled;
  }

  /**
   * 注册拖拽事件回调
   * @param key 唯一标识符，相同 key 会覆盖之前的 callback
   * @param callback 回调函数
   * @returns 取消注册的函数
   */
  register(key: string, callback: DragEventCallback): () => void {
    const isNewKey = !this.callbacks.has(key);

    // 直接更新或添加 callback，不删除再添加，避免重复注册监听器
    this.callbacks.set(key, callback);

    if (this.debug) {
      console.log(
        `[DragDropManager] Register callback with key: "${key}"`,
        isNewKey ? "(new)" : "(update existing)",
        `Total callbacks: ${this.callbacks.size}`
      );
    }

    // 如果还没有监听，则开始监听
    if (!this.isListening) {
      this.startListening();
    }

    // 返回取消注册的函数
    return () => {
      const existed = this.callbacks.has(key);
      this.callbacks.delete(key);

      if (this.debug) {
        console.log(
          `[DragDropManager] Unregister callback with key: "${key}"`,
          existed ? "(existed)" : "(not found)",
          `Remaining callbacks: ${this.callbacks.size}`
        );
      }

      // 如果没有回调了，停止监听
      if (this.callbacks.size === 0) {
        this.stopListening();
      }
    };
  }

  /**
   * 获取当前拖拽状态
   */
  getIsDragging(): boolean {
    return this.isDragging;
  }

  /**
   * 开始监听拖拽事件
   */
  private async startListening() {
    // 如果已经在监听，直接返回
    if (this.isListening) {
      if (this.debug) {
        console.warn(
          "[DragDropManager] Already listening, skip startListening"
        );
      }
      return;
    }

    // 如果正在创建监听器，等待创建完成
    if (this.listeningPromise) {
      if (this.debug) {
        console.log(
          "[DragDropManager] Waiting for existing listening setup..."
        );
      }
      await this.listeningPromise;
      return;
    }

    // 创建监听器的 Promise
    this.listeningPromise = (async () => {
      try {
        const webview = getCurrentWebview();
        // 先清理可能存在的旧监听器
        if (this.unlisten) {
          if (this.debug) {
            console.warn(
              "[DragDropManager] Cleaning up existing unlisten before creating new one"
            );
          }
          try {
            this.unlisten();
          } catch (e) {
            console.warn(
              "[DragDropManager] Error cleaning up old listener:",
              e
            );
          }
          this.unlisten = null;
        }

        this.unlisten = await webview.onDragDropEvent((event) => {
          // 检查是否还在监听状态（可能在事件处理过程中被停止）
          if (!this.isListening) {
            if (this.debug) {
              console.warn(
                "[DragDropManager] Received event but not listening, ignoring"
              );
            }
            return;
          }

          const payload = event.payload;
          const type = payload.type as DragEventType;

          if (this.debug) {
            console.log(
              `[DragDropManager] Drag event received:`,
              type,
              `Active callbacks: ${this.callbacks.size}`,
              type === "drop" && "paths" in payload
                ? `Paths: ${JSON.stringify(payload.paths)}`
                : ""
            );
          }

          // 更新拖拽状态
          if (type === "over" || type === "enter") {
            this.isDragging = true;
          } else if (type === "leave" || type === "cancel" || type === "drop") {
            this.isDragging = false;
          }

          // 通知所有注册的回调
          const dragPayload: DragEventPayload = {
            type,
            paths:
              "paths" in payload && Array.isArray(payload.paths)
                ? (payload.paths as string[])
                : undefined,
            position:
              "position" in payload
                ? (payload.position as { x: number; y: number })
                : undefined,
          };

          // 使用 Array.from 创建副本，避免在迭代时修改 Map
          const callbacksCopy = Array.from(this.callbacks.values());
          const callbackKeys = Array.from(this.callbacks.keys());

          if (this.debug && callbacksCopy.length > 0) {
            console.log(
              `[DragDropManager] Notifying ${callbacksCopy.length} callbacks:`,
              callbackKeys
            );
          }

          callbacksCopy.forEach((callback, index) => {
            try {
              callback(dragPayload);
            } catch (error) {
              console.error(
                `[DragDropManager] Error in callback "${callbackKeys[index]}":`,
                error
              );
            }
          });
        });

        this.isListening = true;
        this.listeningPromise = null; // 清除 Promise

        if (this.debug) {
          console.log(
            "[DragDropManager] Successfully started listening, unlisten function:",
            typeof this.unlisten === "function" ? "available" : "missing"
          );
        }
      } catch (error) {
        console.error(
          "[DragDropManager] Failed to setup Tauri file drop listeners:",
          error
        );
        this.isListening = false;
        this.listeningPromise = null; // 清除 Promise
      }
    })();

    // 等待监听器创建完成
    await this.listeningPromise;
  }

  /**
   * 停止监听拖拽事件
   */
  private stopListening() {
    // 先设置状态为 false，防止新事件被处理
    const wasListening = this.isListening;
    this.isListening = false;
    this.isDragging = false;

    if (!wasListening) {
      if (this.debug) {
        console.warn("[DragDropManager] Not listening, skip stopListening");
      }
      return;
    }

    if (!this.unlisten) {
      if (this.debug) {
        console.warn("[DragDropManager] No unlisten function available");
      }
      return;
    }

    try {
      if (this.debug) {
        console.log("[DragDropManager] Calling unlisten()...");
      }

      const unlistenFn = this.unlisten;
      this.unlisten = null; // 先清空，防止重复调用

      unlistenFn();

      if (this.debug) {
        console.log("[DragDropManager] unlisten() called successfully");
      }
    } catch (error) {
      console.error("[DragDropManager] Error stopping drag listeners:", error);
      // 即使出错也确保状态已重置
    } finally {
      // 确保状态被重置
      this.unlisten = null;
      this.isListening = false;
      this.isDragging = false;
    }
  }

  /**
   * 强制清理所有监听（用于调试或重置）
   */
  cleanup() {
    if (this.debug) {
      console.log(
        `[DragDropManager] Cleanup: clearing ${this.callbacks.size} callbacks`
      );
    }
    this.stopListening();
    this.callbacks.clear();
  }

  /**
   * 获取当前状态（用于调试）
   */
  getState() {
    return {
      isListening: this.isListening,
      isDragging: this.isDragging,
      callbackCount: this.callbacks.size,
      callbackKeys: Array.from(this.callbacks.keys()),
      hasUnlisten: this.unlisten !== null,
    };
  }
}

// 单例实例
export const dragDropManager = new DragDropManager();

// 在开发环境下自动启用调试模式
if (typeof window !== "undefined" && import.meta.env.DEV) {
  // 可以通过 localStorage 控制调试模式
  const debugEnabled = localStorage.getItem("dragDropDebug") === "true";
  dragDropManager.setDebug(debugEnabled);

  // 在控制台暴露管理器，方便调试
  (window as any).dragDropManager = dragDropManager;

  console.log(
    "[DragDropManager] Debug mode:",
    debugEnabled ? "enabled" : "disabled",
    "(set localStorage.setItem('dragDropDebug', 'true') to enable)"
  );
}

/**
 * Hook 风格的 API：注册拖拽事件监听
 * @param key 唯一标识符，用于避免重复注册
 * @param onDragStateChange 拖拽状态变化回调 (isDragging: boolean) => void
 * @param onDrop 文件拖放回调 (paths: string[]) => void
 * @returns 清理函数
 */
export function useDragDrop(
  key: string,
  onDragStateChange?: (isDragging: boolean) => void,
  onDrop?: (paths: string[]) => void
): () => void {
  const callback: DragEventCallback = (payload) => {
    if (payload.type === "over" || payload.type === "enter") {
      onDragStateChange?.(true);
    } else if (payload.type === "leave" || payload.type === "cancel") {
      onDragStateChange?.(false);
    } else if (payload.type === "drop") {
      onDragStateChange?.(false);
      if (payload.paths && payload.paths.length > 0) {
        onDrop?.(payload.paths);
      }
    }
  };

  return dragDropManager.register(key, callback);
}
