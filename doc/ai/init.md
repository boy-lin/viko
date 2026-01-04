#### 给这个 tauri 项目增加项目进入首页检查

1. 检查当前平台是否安装了 ffmpeg，检查是否开起了文件写入读取权限
2. 都通过自动进入首页,
3. 没通过创建一个结果自检列表页面, ffmpeg 没下载，在这条检查后面显示下载安装按钮, 安装完刷新自检结果, 没有开启权限,这条检查后面增加跳转系统设置界面按钮,
4. 增加刷新自检结果按钮, 通过自检后跳转到首页

5. UI 用 react+shadcn+tailwindcss,ui 组件也可参考：Aceternity UI
6. UI 自定义动画可以用 motion

#### 优化项

- 事件压缩与合并：视频帧只保留最新一帧（前端已有 raf 拉取），同时减少
  事件频率（如按目标 FPS 限速）；状态更新用固定间隔合并发送（如 100–
  200ms 聚合 position/volume/state，一次 emit）。

  - 数据格式：帧数据用 Uint8ClampedArray + 固定 RGBA；如果可能，直接
    在 Rust 侧分配固定容量的 Vec 并复用缓冲区（前端用 transferable/
    SharedArrayBuffer 的话要小心类型检查，但可减少拷贝）；音频状态用结
    构化小 JSON，避免字符串序列化/反序列化开销。

  - 线程/锁：后台播放线程减少锁粒度，对只读数据用 Arc<Atomic\*>；跨线程
    通信用无阻塞队列（如 crossbeam channel）降低锁竞争；emit 前先检查窗
    口存在、状态是否变化，避免无效事件。

  - 拉取 vs 推送：前端尽量事件驱动，不再轮询；拖拽时暂停状态推送，松手
    再恢复（减轻频繁 state-update）。

  - 帧尺寸控制：预览场景下在解码器层就 Resize 到合适分辨率，避免传输过
    大的帧；可按容器尺寸动态调整目标分辨率。 PREVIEW_MAX_WIDTH || raw_height > PREVIEW_MAX_HEIGHT

  - 节流绘制：前端 requestAnimationFrame 才绘制，且在离屏/标签页不可见
    时暂停监听或跳过绘制。

  - 日志与调试：减少高频日志（帧级 TRACE），在 devOnly 条件下输出；监控
    统计（平均帧间隔、丢帧数）便于后续微调。
