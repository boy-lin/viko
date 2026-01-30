# 音视频同步分析与改进方案

## 当前实现分析

### 1. 当前架构

**视频播放器** (`video_player.rs`):
- 使用 `wall_clock_anchor`（系统时钟）控制播放速度
- 通过 `decoder.decode_raw()` 解码视频帧
- 使用 `frame_timestamp_secs()` 计算帧的 PTS
- 通过 `wall_clock_anchor.elapsed()` 判断是否该显示当前帧

**音频播放器** (`audio_player.rs`):
- 独立解码音频流
- 使用 `VecDeque<f32>` 缓冲区管理音频数据
- 通过 `samples_processed` 和 `buffer_samples` 计算播放位置
- 没有暴露音频时钟给视频播放器

### 2. 当前问题

1. **时钟基准不统一**
   - 视频使用系统时钟（wall clock）
   - 音频使用自己的播放进度
   - 两者可能漂移，导致不同步

2. **没有音频时钟暴露**
   - `AudioPlayer` 只提供 `get_current_position()`
   - 这个位置是基于解码的样本数，不是实际播放的时钟
   - 视频无法获取"音频主时钟"

3. **视频同步策略简单**
   - 只检查 `pts_secs > elapsed`，如果视频帧提前就 sleep
   - 没有处理视频落后（丢帧）的情况
   - 没有基于音频时钟的同步

## 推荐的音频主时钟方案

### 方案概述

**核心思想**：音频作为主时钟，视频根据音频时钟决定显示哪一帧。

### 架构设计

```
┌─────────────────────────────────────────┐
│  Demux/Decode 线程                       │
│  - 使用 ffmpeg-next 解复用                │
│  - 按 PTS 分别放入音频/视频队列          │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴───────┐
       │               │
       ▼               ▼
┌─────────────┐  ┌─────────────┐
│ 音频队列    │  │ 视频队列    │
│ (按 PTS)    │  │ (按 PTS)    │
└──────┬──────┘  └──────┬───────┘
       │               │
       ▼               ▼
┌─────────────┐  ┌─────────────┐
│ 音频输出    │  │ 视频渲染    │
│ (cpal)      │  │ (按音频时钟)│
│             │  │             │
│ 维护音频时钟│  │ 查询音频时钟│
│ audio_clock │  │ 决定显示帧  │
└─────────────┘  └─────────────┘
```

### 关键实现点

#### 1. 音频主时钟计算

在音频回调函数中维护：

```rust
// 在 audio_player.rs 的回调函数中
let audio_clock = last_audio_pts + played_samples / sample_rate;

// played_samples 是"实际送进设备的采样数"
// 不是解码出来的数量，而是从缓冲区 pop_front() 的数量
```

#### 2. 视频同步策略

```rust
// 在 video_player.rs 中
let audio_clock = audio_player.get_audio_clock(); // 获取音频时钟
let video_pts = frame_timestamp_secs(&frame, time_base);
let diff = video_pts - audio_clock;

if diff > 0.04 {  // 视频提前 > 40ms
    // 视频等一等
    thread::sleep(Duration::from_secs_f64(diff.min(0.5)));
} else if diff < -0.04 {  // 视频落后 > 40ms
    // 丢帧追赶
    continue; // 跳过当前帧，解码下一帧
} else {
    // 正常显示
    emit_frame(frame);
}
```

#### 3. 三条线程设计

**线程 1: Demux/Decode**
- 使用 `ffmpeg-next` 解复用文件
- 解码音频和视频帧
- 按 PTS 分别放入队列

**线程 2: 音频输出（cpal callback）**
- 从音频队列取数据
- 维护音频时钟
- 写入声卡缓冲

**线程 3: 视频渲染**
- 从视频队列取数据
- 查询音频时钟
- 决定是否显示当前帧

## 可行性评估

### ✅ 可行的部分

1. **音频时钟维护**
   - 可以在 cpal 回调中跟踪 `played_samples`
   - 需要记录 `last_audio_pts`
   - 需要暴露 `get_audio_clock()` 方法

2. **视频同步逻辑**
   - 可以修改 `spawn_playback` 中的帧显示逻辑
   - 从 `wall_clock_anchor` 改为查询音频时钟
   - 实现丢帧追赶机制

3. **队列管理**
   - 可以使用 `Arc<Mutex<VecDeque>>` 实现线程安全队列
   - 音频和视频分别维护队列

### ⚠️ 需要重构的部分

1. **解复用架构**
   - 当前使用 `video-rs` 和独立的 `AudioPlayer`
   - 需要统一使用 `ffmpeg-next` 解复用
   - 或者保持当前架构，但添加音频时钟暴露

2. **音频时钟暴露**
   - `AudioPlayer` 需要暴露 `get_audio_clock()`
   - 需要在回调中维护 `last_audio_pts` 和 `played_samples`

3. **视频队列**
   - 当前是直接解码并显示
   - 需要改为先解码到队列，再根据音频时钟显示

## 渐进式改进方案

### 阶段 1: 添加音频时钟（最小改动）

**目标**：让视频能够查询音频时钟，实现基本同步。

**改动**：
1. 在 `AudioPlayer` 中添加 `get_audio_clock()` 方法
2. 在音频回调中维护 `last_audio_pts` 和 `played_samples`
3. 在 `VideoPlayer` 中查询音频时钟，替代 `wall_clock_anchor`

**优点**：
- 改动最小
- 保持当前架构
- 可以立即改善同步

### 阶段 2: 实现视频队列和丢帧（中等改动）

**目标**：实现视频队列，支持丢帧追赶。

**改动**：
1. 在 `VideoPlayer` 中添加视频帧队列
2. 解码线程填充队列
3. 渲染线程根据音频时钟决定显示

**优点**：
- 支持丢帧追赶
- 更好的同步控制

### 阶段 3: 统一解复用（大改动）

**目标**：使用 `ffmpeg-next` 统一解复用，实现完整的三线程架构。

**改动**：
1. 移除 `video-rs`，改用 `ffmpeg-next`
2. 创建独立的 Demux/Decode 线程
3. 实现音频和视频队列

**优点**：
- 架构最清晰
- 完全符合推荐方案
- 但改动较大

## 推荐实施路径

**建议从阶段 1 开始**：
1. 先实现音频时钟暴露
2. 修改视频同步逻辑使用音频时钟
3. 测试同步效果
4. 如果效果不理想，再考虑阶段 2 和 3

这样可以：
- 快速改善同步问题
- 风险最小
- 为后续改进打下基础

