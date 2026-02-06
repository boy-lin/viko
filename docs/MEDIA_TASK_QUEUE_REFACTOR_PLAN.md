# MediaTaskQueue 队列改造计划

## 一、现状与问题

### 1.1 当前实现（bridge.ts）

- **多实例**：`converterQueue`、`compressorQueue` 各 `new MediaTaskQueue("convert" | "compress")`，两套队列、两套逻辑。
- **按任务注册监听**：在 `prepareConversionTask` / `prepareCompressionTask` 里，**每个任务**都执行一次 `listen("media-task-event", handler)`，用 `task.id` 存到 `this.listeners`。
- **后果**：N 个任务 = N 个 `media-task-event` 监听器；每条事件被 N 个 handler 收到，再在内部用 `task_id` 过滤。监听器多、调用频繁、难以扩展 metadata/watermark。

### 1.2 后端（Rust）

- 已是**单队列**：`queue.rs` 里 `TASK_QUEUE` 单例，`MediaTaskRequest` 枚举仅有 convert-* / compress-*，无 metadata/watermark 变体。
- 事件：`MediaTaskEvent` 含 `task_type`（convert | compress）、`media_type`、`event_type` 等，前端类型需与之对齐并扩展。

### 1.3 目标

- **单例队列**：全局唯一队列实例，统一管理 convert、compress、metadata、watermark。
- **按需监听**：有任务时**只注册一个** `media-task-event` 监听；全部任务结束后**移除该监听**，避免无任务时仍接收事件。
- **易扩展**：后续增加 metadata、watermark 等任务类型时，只扩展配置与分支，不新增队列类或重复监听逻辑。

---

## 二、改造方案概览

| 项目         | 现状                     | 目标                                       |
|--------------|--------------------------|--------------------------------------------|
| 队列实例     | 2 个（convert / compress）| 1 个单例 `mediaTaskQueue`                   |
| 事件监听     | 每任务 1 个 listen       | 全局 1 个 listen，有任务时注册、无任务时注销 |
| 任务类型     | convert / compress       | convert / compress / metadata / watermark  |
| 调用方       | converterQueue / compressorQueue | 统一使用 `getMediaTaskQueue()` 或单例导出 |

---

## 三、前端改造步骤

### 3.1 单例 + 禁止多次 new

- 将 `MediaTaskQueue` 改为单例：
  - 方案 A：类内 `private static instance` + `static getInstance()`（TS 用模块级变量模拟）。
  - 方案 B（推荐）：模块级唯一实例 `let instance: MediaTaskQueue | null = null`，导出 `function getMediaTaskQueue(): MediaTaskQueue`，内部 `if (!instance) instance = new MediaTaskQueue(); return instance`；**构造函数改为 private 或包内可见**，仅通过 `getMediaTaskQueue()` 获取。
- 若仍保留类：在 `constructor` 内检查 `if ((MediaTaskQueue as any).instance) throw new Error("MediaTaskQueue is singleton")` 并设置 `(MediaTaskQueue as any).instance = this`，防止误用 `new`。

### 3.2 统一任务类型与请求体

- 扩展类型定义（与后端对齐、为 metadata/watermark 预留）：
  - `TaskType = "convert" | "compress" | "metadata" | "watermark"`。
  - `MediaTaskEvent.task_type` 使用上述类型（后端若尚未发 metadata/watermark，可先在前端类型里扩展，后端后续补齐）。
  - `MediaTaskRequest` 增加分支，例如：
    - `| { kind: "metadata"; args: Record<string, unknown> }`
    - `| { kind: "watermark"; args: Record<string, unknown> }`
  具体字段在后端定义后再补全。
- 队列内部用 `TaskType` 区分“谁提交的”、走哪套 store（converter / compressor / 未来的 metadata-store 等）。

### 3.3 单一事件监听 + 按需开关

- **只保留一个** `media-task-event` 的 `listen`：
  - 在队列类内维护：`private eventUnlisten: UnlistenFn | null = null`；再维护“当前是否有未结束任务”的状态（见下）。
- **注册时机**：在 `add()` 或第一次 `add()` 成功提交任务到后端之后，若当前**没有**在监听，则调用 `listen("media-task-event", this.handleMediaTaskEvent)`，并把返回的 `UnlistenFn` 存到 `eventUnlisten`。
- **注销时机**：在**统一的事件处理函数** `handleMediaTaskEvent` 里，当某条事件表示该任务结束（`event_type === "complete" | "error"`）时：
  - 从“进行中任务集合”里移除该 `task_id`；
  - 若移除后“进行中任务集合”为空，则调用 `eventUnlisten()` 并置 `eventUnlisten = null`，即关闭监听。
- **进行中任务集合**：用 `Set<string>` 或 `Map<taskId, TaskType>` 记录当前已提交、尚未收到终态事件的任务 id；在 `add()` 里把本次提交的 `task_id` 加入，在收到 complete/error 时移除。这样“有任务才监听、没任务就关”的逻辑清晰且可靠。

### 3.4 事件处理集中化

- 将现在分散在 `prepareConversionTask` / `prepareCompressionTask` 里的“根据 event 更新 store、写 DB、cleanup listener”逻辑，收拢到**一个** `handleMediaTaskEvent(payload: MediaTaskEvent)`：
  - 根据 `payload.task_id` 找到对应任务信息（若需要 taskType/mediaType，可从“进行中任务集合”的 Map 里取）；
  - 根据 `payload.event_type`（progress / complete / error）分支；
  - 根据 `payload.task_type`（convert | compress | metadata | watermark）决定更新哪个 store（converterStore / compressorStore / 未来 metadata 等）；
  - progress：更新对应 store 的 progress；
  - complete：更新状态、outputPath、outputSize，写 converterDB、incrementUnread 等，然后从“进行中任务集合”移除，并检查是否要关闭监听；
  - error：更新错误状态，移除任务，同样检查是否关闭监听。
- **不再按任务 id 存 UnlistenFn**：每个任务只占“进行中任务集合”一条记录，不再单独 `this.listeners.set(task.id, unlisten)`；唯一需要管理的是那**一个**全局 `eventUnlisten`。

### 3.5 prepare 与 add 重构

- **prepare 只负责“构建请求 + 更新 store 初始状态”**：
  - `prepareConversionTask(task)` → 返回 `MediaTaskRequest | null`，并执行 `updateTaskById(task.id, { status: "converting", progress: 0 })` 等；
  - `prepareCompressionTask(task)` → 同上；
  - 未来：`prepareMetadataTask(...)`、`prepareWatermarkTask(...)` 同理。
- **不再在 prepare 里注册 listen**；prepare 只把要提交的 `task_id`（及 taskType）告知队列，供 `add()` 加入“进行中任务集合”。
- **add(tasks, taskType, priority)**：
  - 入参可改为 `add(tasks, taskType: TaskType, priority?)`，或保留重载：convert 传 ConverterTask[]，compress 传 ConverterTask[]，metadata/watermark 后续定类型。
  - 对每个 task 调用对应的 prepare（根据 taskType 分支），得到 `MediaTaskRequest[]`；
  - 将本次提交的所有 `task_id` 加入“进行中任务集合”；
  - **若当前 `eventUnlisten === null`**，则先 `listen("media-task-event", ...)` 并保存 `eventUnlisten`；
  - 再 `invoke("media_task_submit", { tasks, priority })`。

这样“有任务才监听、任务全结束才关监听”的闭环就只在队列内部完成，对外 API 保持 `add` / `hasRunningTasks` / `clearQueue` 等即可。

### 3.6 调用方迁移

- 将所有使用 `converterQueue` 的地方改为使用单例，例如：
  - `import { getMediaTaskQueue } from "@/lib/bridge";`
  - `getMediaTaskQueue().add(tasks, "convert");`
  - `getMediaTaskQueue().hasRunningTasks();`
  - `getMediaTaskQueue().clearQueue();`
- 将所有使用 `compressorQueue` 的地方改为：
  - `getMediaTaskQueue().add(tasks, "compress");` 等。
- 删除对 `converterQueue`、`compressorQueue` 的导出；或保留为兼容性别名，内部指向 `getMediaTaskQueue()`，待调用方全部迁移后再删除别名。

---

## 四、后端需配合的部分（可选，按迭代做）

- **任务类型扩展**：若本期要做 metadata/watermark 任务，需在 Rust 的 `MediaTaskRequest` 中增加变体，并在 `execute_task` 中分支调用对应 service；否则前端可先预留类型与“进行中任务集合”里的 taskType，后端后续再加。
- **事件**：`emit_media_task_event` 已支持 `task_type` 字符串，只要后端在 metadata/watermark 执行时传入 `task_type: "metadata"` / `"watermark"` 即可，前端 `MediaTaskEvent.task_type` 已扩展即可正确路由到对应 store 或 no-op。

---

## 五、实施顺序建议

1. **Phase 1（仅前端单例 + 按需监听）**
   - 单例化 `MediaTaskQueue`，禁止多处 `new`。
   - 引入“进行中任务集合”与**一个** `media-task-event` 监听；在 add 时注册监听（若尚未注册），在 handleMediaTaskEvent 里 complete/error 时移除任务并若集合为空则注销监听。
   - 将原先每个任务一个 listener 的逻辑合并到一个 `handleMediaTaskEvent`，按 `task_id` + `task_type` 更新对应 store。
   - 保持 `taskType` 仍为 convert | compress，API 保持 `add(tasks, priority)`，通过现有 `this.taskType` 或 add 的第二个参数区分 convert/compress。
   - 替换调用方为单例调用，跑通 convert + compress 全流程。

2. **Phase 2（类型与 API 统一）**
   - 将 `TaskType` 显式化为 `"convert" | "compress" | "metadata" | "watermark"`，`add` 签名改为 `add(tasks, taskType: TaskType, priority?)`。
   - `MediaTaskRequest` 与 `MediaTaskEvent` 类型扩展 metadata/watermark，后端未实现时前端先占位分支（no-op 或仅更新本地状态）。

3. **Phase 3（metadata / watermark 能力）**
   - 后端增加 metadata/watermark 任务执行与事件上报；
   - 前端实现 `prepareMetadataTask`、`prepareWatermarkTask` 及在 `handleMediaTaskEvent` 中对应 store 更新与 DB 写入。

---

## 六、验收要点

- 全局仅有一个队列实例，无法通过 `new MediaTaskQueue()` 创建第二个实例。
- 无任务时，不注册 `media-task-event` 监听（可通过日志或断点确认 listen 仅在第一次 add 时调用）。
- 所有任务（convert/compress）结束后，监听被注销（同上，无任务时无 listen）。
- 现有转换、压缩流程行为与改造前一致（进度、完成、错误、My Files 写入等）。
- 后续接入 metadata/watermark 时，只需扩展 TaskType、Request、事件分支与 prepare/handle 逻辑，无需再增加新队列或新监听方式。
