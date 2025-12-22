# Seek 后音频播放不完整问题排查

## 问题描述

快进到 113s 后播放，播放到 121.54s / 123.04s（98.8%）就停止，还差约 1.5 秒没有播放。

## 可能的原因

### 1. Seek 后数据包迭代器提前结束

**现象**：
- Seek 到接近文件末尾的位置（113s，文件总长 123.04s）
- 数据包迭代器可能提前返回 `None`
- 但解码器内部可能还有未处理的帧

**排查**：
```bash
# 查看 seek 相关的日志
grep -E "跳转|seek|数据包迭代器结束" audio_debug.log
```

### 2. Seek 后解码器状态未完全重置

**现象**：
- Seek 后虽然调用了 `decoder.flush()`，但可能还有残留状态
- 需要多次 flush 才能完全清空

**排查**：
- 检查日志中是否有 "跳转后 flush 找到" 的日志
- 检查是否调用了 `resampler.flush()`

### 3. 文件接近末尾时的特殊处理

**现象**：
- 当 seek 到接近文件末尾时，FFmpeg 的行为可能不同
- 数据包迭代器可能提前结束，但实际还有数据

**排查**：
```bash
# 使用 ffprobe 检查文件末尾的数据包
ffprobe -v error -show_packets -select_streams a:0 -show_entries packet=pts_time,duration_time -of csv=p=0 your_file.mp3 | tail -20
```

## 已实现的改进

### 1. Seek 后预填充时的 flush

在 seek 后的预填充循环中，如果数据包迭代器提前结束，会：
1. 调用 `decoder.flush()` 和 `resampler.flush()`
2. 尝试读取所有剩余的帧
3. 将找到的帧放入缓冲区

### 2. 正常播放循环中的 flush

在正常播放循环中，当数据包迭代器结束时：
1. 调用 `decoder.flush()` 和 `resampler.flush()`
2. 循环读取所有剩余帧
3. 如果找到帧，继续循环
4. 如果没找到，进入"等待缓冲区播放"逻辑

### 3. 数据包提前结束时的恢复

当检测到"数据包提前结束"时：
1. 再次调用 `decoder.flush()` 和 `resampler.flush()`
2. 尝试读取遗漏的帧（最多 10 次）
3. 如果找到帧，继续播放

## 排查步骤

### 步骤 1: 查看 seek 相关日志

```bash
# 运行应用并查看日志
RUST_LOG=debug cargo tauri dev 2>&1 | tee seek_debug.log

# 过滤 seek 相关日志
grep -E "跳转|seek|数据包迭代器结束|flush" seek_debug.log
```

**关键日志**：
- `跳转到位置: X 秒` - seek 命令
- `跳转完成` - seek 完成
- `跳转后预填充时数据包迭代器结束` - 预填充时数据包结束
- `跳转后 flush 找到 X 样本` - flush 找到的样本数
- `数据包迭代器结束，开始 flush` - 正常播放时数据包结束

### 步骤 2: 验证文件完整性

```bash
# 检查文件总时长
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 your_file.mp3

# 检查最后 10 秒的数据包
ffprobe -v error -show_packets -select_streams a:0 \
  -show_entries packet=pts_time,duration_time \
  -of csv=p=0 your_file.mp3 | tail -20
```

### 步骤 3: 测试 seek 到不同位置

```bash
# 使用 ffmpeg 测试 seek 到 113s
ffmpeg -i your_file.mp3 -ss 113 -t 10 -c copy test_seek_113.mp3
ffplay test_seek_113.mp3

# 检查是否能播放完整
```

### 步骤 4: 检查解码器状态

在代码中添加更详细的日志：

```rust
// 在 seek 后
log::debug!("Seek 后状态:");
log::debug!("  - target: {}s", target);
log::debug!("  - samples_processed: {}", samples_processed);
log::debug!("  - buffer_samples: {}", buffer.lock().map(|g| g.len()).unwrap_or(0));
log::debug!("  - audio_clock: {}", *audio_clock.lock().unwrap());
```

## 可能需要的进一步改进

### 1. 多次 flush 尝试

```rust
// 在数据包迭代器结束后，尝试多次 flush
for flush_attempt in 1..=3 {
    decoder.flush();
    resampler.flush(&mut resampled);
    // 读取帧...
    if !found_more {
        break;
    }
}
```

### 2. 发送 NULL 包

某些解码器（如 AAC）可能需要发送 NULL 包来触发 flush：

```rust
// 尝试发送 NULL 包
let null_packet = ffmpeg::packet::Packet::empty();
if decoder.send_packet(&null_packet).is_ok() {
    // 然后读取帧
}
```

### 3. 检查文件末尾的特殊处理

当 seek 到接近文件末尾时，可能需要特殊处理：

```rust
// 检查是否接近文件末尾
if target >= audio_duration * 0.95 {
    log::debug!("Seek 到接近文件末尾，使用特殊处理");
    // 特殊处理逻辑
}
```

## 调试命令

### 查看 seek 日志

```bash
# 运行应用
RUST_LOG=debug cargo tauri dev 2>&1 | tee seek_debug.log

# 过滤关键日志
grep -E "跳转|seek|flush|数据包迭代器" seek_debug.log | tail -50
```

### 使用 ffprobe 检查

```bash
# 检查文件信息
ffprobe -v error -show_entries format=duration,size -of json your_file.mp3

# 检查最后 10 秒的数据包
ffprobe -v error -show_packets -select_streams a:0 \
  -show_entries packet=pts_time,duration_time,size \
  -of csv=p=0 your_file.mp3 | tail -20
```

### 测试 seek 功能

```bash
# 提取从 113s 开始的所有内容
ffmpeg -i your_file.mp3 -ss 113 -c copy test_from_113.mp3

# 检查提取的文件时长
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 test_from_113.mp3

# 应该接近 10.04s (123.04 - 113)
```

## 常见问题

### Q: 为什么 seek 后数据包迭代器会提前结束？

A: 当 seek 到接近文件末尾时，FFmpeg 可能提前判断文件结束，但解码器内部可能还有缓冲的帧。

### Q: 为什么需要多次 flush？

A: 某些解码器（特别是带 B 帧的）可能需要多次 flush 才能完全清空缓冲区。

### Q: 如何判断是文件问题还是代码问题？

A: 
1. 使用 `ffmpeg` 命令行工具测试 seek 功能
2. 如果 `ffmpeg` 能正常提取和播放，说明文件没问题，问题在代码
3. 如果 `ffmpeg` 也有问题，可能是文件本身的问题

## 下一步

1. **运行应用并查看日志**，特别关注：
   - "跳转后预填充时数据包迭代器结束"
   - "跳转后 flush 找到 X 样本"
   - "数据包迭代器结束，开始 flush"

2. **使用 ffprobe 检查文件**，确认文件是否完整

3. **使用 ffmpeg 测试 seek**，确认是否能正常提取最后 10 秒

4. **根据日志结果**，确定是否需要进一步改进代码

