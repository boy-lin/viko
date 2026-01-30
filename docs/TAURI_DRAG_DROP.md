# Tauri 拖拽上传实现指南

## 方案概述

在 Tauri 中实现拖拽上传有两种主要方式：

### 方案 1：使用 HTML5 Drag and Drop API（当前实现）

**优点：**
- 实现简单，使用标准 Web API
- 支持文件夹拖拽
- 跨平台兼容

**缺点：**
- 在 Tauri 中可能无法直接获取文件完整路径
- 需要依赖 File 对象的 `path` 属性（Tauri 环境可能提供）

**当前实现位置：** `src/pages/converter/v2/UploadPanel.tsx`

### 方案 2：使用 Tauri 后端事件监听（推荐）

**优点：**
- 直接获取文件完整路径
- 更可靠，不依赖浏览器 API
- 更好的性能

**缺点：**
- 需要修改 Rust 后端代码
- 需要处理窗口事件

## 方案 2 实现步骤

### 1. 修改 `tauri.conf.json`

确保窗口配置允许拖拽：

```json
{
  "app": {
    "windows": [
      {
        "title": "audio_video_kit",
        "width": 980,
        "height": 600,
        "fileDropEnabled": true  // 启用文件拖拽
      }
    ]
  }
}
```

### 2. 在 Rust 后端监听拖拽事件

在 `src-tauri/src/lib.rs` 的 `run()` 函数中添加：

```rust
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        // ... 其他配置 ...
        .setup(|app| {
            // 监听窗口事件
            app.listen("tauri://file-drop", |event| {
                if let Some(paths) = event.payload() {
                    // 发送文件路径到前端
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.emit("file-drop", paths);
                    }
                }
            });
            
            Ok(())
        })
        // ...
}
```

### 3. 在前端监听事件

在 `UploadPanel.tsx` 中添加：

```typescript
import { listen } from "@tauri-apps/api/event";

useEffect(() => {
  const unlisten = listen<string[]>("file-drop", async (event) => {
    const paths = event.payload;
    if (paths && paths.length > 0) {
      // 处理文件路径
      await handlePaths(paths);
    }
  });

  return () => {
    unlisten.then((fn) => fn());
  };
}, []);
```

## 当前实现说明

当前项目使用**方案 1**（HTML5 Drag and Drop），实现要点：

1. **拖拽区域**：使用 `onDragOver`、`onDragLeave`、`onDrop` 事件
2. **文件处理**：通过 `getFilesFromDrop` 函数递归读取文件夹
3. **路径获取**：尝试从 File 对象的 `path` 属性获取路径
4. **降级处理**：如果无法获取路径，提示用户使用文件选择按钮

## 测试建议

1. **测试文件拖拽**：从文件管理器拖拽单个文件
2. **测试文件夹拖拽**：从文件管理器拖拽整个文件夹
3. **测试路径获取**：确认拖拽的文件能正确获取路径
4. **测试格式过滤**：确认不支持的文件格式被正确拒绝

## 故障排除

### 问题：拖拽后无法获取文件路径

**解决方案：**
- 检查 File 对象是否有 `path` 属性
- 考虑切换到方案 2（后端事件监听）
- 或者提示用户使用文件选择按钮

### 问题：拖拽事件不触发

**解决方案：**
- 检查 `tauri.conf.json` 中的 `fileDropEnabled` 设置
- 确认没有其他元素阻止事件冒泡
- 检查 CSS 样式是否阻止了拖拽区域

## 参考资源

- [Tauri Window Events](https://tauri.app/v1/api/js/window/)
- [HTML5 Drag and Drop API](https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API)
- [Tauri File Drop Example](https://github.com/tauri-apps/tauri/tree/dev/examples)
