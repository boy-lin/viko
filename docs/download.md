

✅ 首选：方案 1（浏览器扩展嗅探） + 方案 2（Tauri 负责下载/合并/管理）

扩展负责“解析”（抓到真实媒体 URL + headers）

Tauri 负责“落盘”（下载、重试、合并、历史、批量）

🚫 不建议把网页直接塞进 Tauri WebView 再去“拦截请求”，因为 Wry 这块能力目前不够完整（社区已有结论）。

我能直接给你一套可落地的架构（不问你更多也行）

如果你希望我直接输出“实现蓝图”，我可以下一条就给：

Chrome MV3 扩展：如何过滤出 master m3u8 / mpd / mp4、如何抓 headers

扩展 → Tauri 通信：localhost（HTTP/WebSocket）协议设计

Tauri（Rust）下载器：任务队列、断点续传、m3u8 分片并发、调用 ffmpeg 的接口设计