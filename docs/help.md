
改造计划（分阶段）

  1. Phase A：通信收口（1-2天）

  - 把 src 内直接 invoke/listen 全迁入 bridge。
      - Layout.tsx (/D:/persional/figurex/src/components/Layout.tsx)
      - RootPage.tsx (/D:/persional/figurex/src/layout/RootPage.tsx)
      - SelfCheck.tsx (/D:/persional/figurex/src/components/SelfCheck.tsx)
      - metadata/index.tsx (/D:/persional/figurex/src/pages/metadata/index.tsx)
      - FileSelector.tsx (/D:/persional/figurex/src/components/FileSelector.tsx)
      - mp3/converter.tsx (/D:/persional/figurex/src/components/mp3/converter.tsx)
  2. Phase B：阻塞命令异步化（1-2天）

  - Rust 侧把同步重命令改为 async + spawn_blocking。
  - 目标命令：get_media_info、run_self_check、write_media_metadata、auth_exchange_code。
  - 文件：commands/mod.rs (/D:/persional/figurex/src-tauri/src/commands/mod.rs)


  - 前端增加流聚合器（requestId 管理、chunk 合并、超时取消）。

  4. Phase D：高频链路降压（1-2天）

  - 播放器 position 查询改“事件推送优先，轮询兜底”。
  - media_task_event 的 store 更新改批量 flush。
  - 文件：
      - mediaTaskQueue.ts (/D:/persional/figurex/src/lib/mediaTaskQueue.ts)

      
  当前状态说明

  - 你这批目标文件（Layout/RootPage/SelfCheck/FileSelector/metadata/desktop-auth/updater/force-update）里，直连 invoke(...) 已清理完毕或改
    为 bridge。                                                                                                                           
  - 项目里仍有其他模块保留直连（例如 mediaTaskQueue.ts、mp3/converter.tsx、revealItemInDir.ts），这是下一批可继续收口的点。               
                                                                                                                                          
  如果你同意，我下一步就把这些剩余直连点也统一迁移到 bridge.ts (/D:/persional/figurex/src/lib/bridge.ts)。