# FFmpeg 使用规范

## 概述

本项目使用 FFmpeg 进行音视频处理。为了保持代码一致性、可维护性和性能，必须遵循以下规范。

## 核心原则

### 1. 优先使用 `ffmpeg-next` 库（Rust 绑定）

**必须使用** `ffmpeg-next` 库（版本 7.1.0）作为主要的 FFmpeg 接口，而不是：

- ❌ 命令行方式（`std::process::Command::new("ffmpeg")`）
- ❌ 直接 FFI 调用（除非有特殊需求）

**原因：**

- 类型安全：Rust 类型系统提供编译时检查
- 内存安全：自动管理 FFmpeg 资源生命周期
- 代码可读性：更符合 Rust 习惯用法
- 错误处理：统一的错误类型

### 2. FFI 使用场景

仅在以下情况下考虑使用 FFI（`ffmpeg_ffi.rs` + `ffmpeg_loader.rs`）：

- 需要运行时动态加载 FFmpeg 库（不依赖系统安装）
- 需要访问 `ffmpeg-next` 未暴露的底层 API
- 需要与特定 FFmpeg 版本兼容

**注意：** 当前项目中 FFI 实现主要用于实验性功能，生产代码应优先使用 `ffmpeg-next`。

## 标准使用模式

### 初始化

```rust
use ffmpeg_next as ffmpeg;

// 在使用任何 FFmpeg 功能前，必须先初始化
ffmpeg::init().map_err(|e| format!("FFmpeg 初始化失败: {}", e))?;
```

### 打开输入文件

```rust
// ✅ 正确：使用 format::input
let mut ictx = ffmpeg::format::input(path)
    .map_err(|e| format!("打开文件失败: {}", e))?;

// ❌ 错误：不要使用命令行
// let mut cmd = Command::new("ffmpeg");
```

### 查找音频/视频流

```rust
// ✅ 正确：使用 streams().best()
let audio_stream = ictx
    .streams()
    .best(ffmpeg::media::Type::Audio)
    .ok_or_else(|| "未找到音频流".to_string())?;

let video_stream = ictx
    .streams()
    .best(ffmpeg::media::Type::Video)
    .ok_or_else(|| "未找到视频流".to_string())?;
```

### 创建解码器

```rust
// ✅ 正确：从流参数创建解码器上下文
let mut decoder_context = ffmpeg::codec::context::Context::from_parameters(
    stream.parameters()
).map_err(|e| format!("创建解码器失败: {}", e))?;

let mut decoder = decoder_context
    .decoder()
    .audio()  // 或 .video()
    .map_err(|e| format!("获取解码器失败: {}", e))?;
```

### 读取数据包

```rust
// ✅ 正确：使用 packets() 迭代器
for (stream, packet) in ictx.packets() {
    if stream.index() == target_stream_index {
        // 发送数据包到解码器
        decoder.send_packet(&packet)?;

        // 接收解码后的帧
        while decoder.receive_frame(&mut frame).is_ok() {
            // 处理帧
        }
    }
}

// ❌ 错误：不要使用命令行读取
// let output = Command::new("ffmpeg").arg("-i").arg(path).output()?;
```

### 解码循环模式

```rust
// ✅ 标准解码循环
loop {
    match decoder.receive_frame(&mut frame) {
        Ok(_) => {
            // 处理解码后的帧
        }
        Err(ffmpeg::Error::Other { errno })
            if errno == ffmpeg::util::error::EAGAIN => {
            // 需要更多输入数据包
            break;
        }
        Err(ffmpeg::Error::Eof) => {
            // 解码器已结束
            break;
        }
        Err(err) => {
            // 其他错误
            return Err(format!("解码失败: {}", err));
        }
    }
}
```

### 刷新解码器（Flush）

```rust
// ✅ 正确：在数据包结束后 flush 解码器
decoder.flush();

// 继续读取剩余帧
loop {
    match decoder.receive_frame(&mut frame) {
        Ok(_) => {
            // 处理剩余的帧
        }
        Err(ffmpeg::Error::Other { errno })
            if errno == ffmpeg::util::error::EAGAIN => {
            break; // 没有更多帧了
        }
        Err(_) => break,
    }
}
```

**重要：** 必须在数据包迭代器结束后调用 `flush()`，以确保获取所有缓冲的帧。

### 创建编码器

```rust
// ✅ 正确：查找编码器并创建上下文
let codec_id = get_codec_id_for_format(&format);
let encoder_codec = ffmpeg::encoder::find(codec_id)
    .ok_or_else(|| format!("未找到编码器: {:?}", codec_id))?;

let mut encoder_context = ffmpeg::codec::context::Context::new();
let mut encoder = encoder_context
    .encoder()
    .audio()  // 或 .video()
    .map_err(|e| format!("获取编码器失败: {}", e))?;

// 配置编码器参数
encoder.set_rate(sample_rate as i32);
encoder.set_channel_layout(ChannelLayout::STEREO);
encoder.set_format(Sample::F32(SampleType::Packed));
encoder.set_bit_rate((bitrate * 1000) as usize);

// 打开编码器
let mut options = ffmpeg::Dictionary::new();
encoder.open_with(options)
    .map_err(|e| format!("打开编码器失败: {}", e))?;
```

### 编码循环模式

```rust
// ✅ 标准编码循环
// 发送帧到编码器
encoder.send_frame(&frame)
    .map_err(|e| format!("发送帧失败: {}", e))?;

// 接收编码后的数据包
while encoder.receive_packet(&mut packet).is_ok() {
    packet.set_stream(0);
    packet.rescale_ts(
        encoder.time_base(),
        output_stream.time_base(),
    );
    packet.write_interleaved(&mut octx)
        .map_err(|e| format!("写入数据包失败: {}", e))?;
}
```

### 重采样

```rust
// ✅ 正确：使用 software::resampling
let mut resampler = ffmpeg::software::resampling::context::Context::get(
    input_format,
    input_channel_layout,
    input_sample_rate,
    output_format,
    output_channel_layout,
    output_sample_rate,
).map_err(|e| format!("创建重采样器失败: {}", e))?;

// 重采样帧
resampler.run(&input_frame, &mut output_frame)
    .map_err(|e| format!("重采样失败: {}", e))?;

// 结束时 flush 重采样器
resampler.flush(&mut output_frame)?;
```

### Seek 操作

```rust
// ✅ 正确：使用 seek 方法
let ts = (target_time * ffmpeg::ffi::AV_TIME_BASE as f64) as i64;

// 优先使用流索引限制
if ictx.seek(ts, stream_index as i64..).is_err() {
    // 回退到全局 seek
    ictx.seek(ts, ..)?;
}

// Seek 后必须 flush 解码器
decoder.flush();
resampler.flush(&mut resampled);

// 重新创建数据包迭代器
packet_iter = Some(ictx.packets());
```

### 获取时长

```rust
// ✅ 正确：优先使用流级别的 duration
let duration = if let Some(audio_stream) = ictx.streams().best(ffmpeg::media::Type::Audio) {
    let time_base = audio_stream.time_base();
    let duration_ts = audio_stream.duration();
    if duration_ts > 0 {
        duration_ts as f64 * time_base.numerator() as f64 / time_base.denominator() as f64
    } else {
        // 回退到格式级别的 duration
        let dur_raw = ictx.duration();
        if dur_raw > 0 && dur_raw != ffmpeg::ffi::AV_NOPTS_VALUE as i64 {
            dur_raw as f64 / ffmpeg::ffi::AV_TIME_BASE as f64
        } else {
            0.0
        }
    }
} else {
    0.0
};
```

## 常见错误和避免方法

### ❌ 错误 1：使用命令行方式

```rust
// ❌ 错误
let mut cmd = Command::new("ffmpeg");
cmd.arg("-i").arg(input_path);
// ...

// ✅ 正确：使用 ffmpeg-next API
let mut ictx = ffmpeg::format::input(input_path)?;
```

### ❌ 错误 2：忘记 flush 解码器

```rust
// ❌ 错误：数据包结束后直接退出
for (stream, packet) in ictx.packets() {
    decoder.send_packet(&packet)?;
    // 缺少 flush，可能丢失最后几帧
}

// ✅ 正确：数据包结束后 flush
for (stream, packet) in ictx.packets() {
    decoder.send_packet(&packet)?;
    // ...
}
decoder.flush(); // 必须 flush
while decoder.receive_frame(&mut frame).is_ok() {
    // 处理剩余帧
}
```

### ❌ 错误 3：忽略 EAGAIN 错误

```rust
// ❌ 错误：将 EAGAIN 当作致命错误
match decoder.receive_frame(&mut frame) {
    Ok(_) => { /* ... */ }
    Err(e) => return Err(format!("解码失败: {}", e)), // 错误！
}

// ✅ 正确：正确处理 EAGAIN
match decoder.receive_frame(&mut frame) {
    Ok(_) => { /* ... */ }
    Err(ffmpeg::Error::Other { errno })
        if errno == ffmpeg::util::error::EAGAIN => {
        // 需要更多输入，这是正常情况
        break;
    }
    Err(e) => return Err(format!("解码失败: {}", e)),
}
```

### ❌ 错误 4：不处理重采样器的 flush

```rust
// ❌ 错误：只 flush 解码器
decoder.flush();
// 缺少重采样器 flush，可能丢失尾部数据

// ✅ 正确：同时 flush 解码器和重采样器
decoder.flush();
resampler.flush(&mut resampled)?;
// 处理 flush 后的数据
```

### ❌ 错误 5：不检查 PTS 有效性

```rust
// ❌ 错误：直接使用 PTS
let pts = packet.pts().unwrap(); // 可能 panic

// ✅ 正确：检查 PTS
if let Some(pts) = packet.pts() {
    let time_base = stream.time_base();
    let pts_seconds = pts as f64 * time_base.numerator() as f64
        / time_base.denominator() as f64;
    // 使用 pts_seconds
}
```

## 文件组织

### 模块职责

- **`audio.rs`**: 音频播放功能，使用 `ffmpeg-next` 解码音频
- **`audio_converter.rs`**: 音频格式转换，使用 `ffmpeg-next` 进行转码
- **`video_player.rs`**: 视频播放功能，使用 `ffmpeg-next` 解码视频
- **`ffmpeg_ffi.rs`**: FFI 绑定定义（实验性，不用于生产代码）
- **`ffmpeg_loader.rs`**: 动态库加载器（用于 FFI 方式）

### 导入规范

```rust
// ✅ 标准导入
use ffmpeg_next as ffmpeg;
use ffmpeg::codec;
use ffmpeg::format;
use ffmpeg::util::channel_layout::ChannelLayout;
use ffmpeg::util::format::Sample;
use ffmpeg::util::frame::Audio;

// 或使用 video_rs 的重新导出（如果可用）
use video_rs::ffmpeg::{self, ...};
```

## 性能优化建议

1. **复用解码器/编码器上下文**：避免频繁创建和销毁
2. **批量处理帧**：减少锁竞争
3. **使用合适的缓冲区大小**：根据采样率和通道数计算
4. **避免不必要的格式转换**：尽量保持原始格式

## 调试技巧

1. **记录关键 PTS**：特别是接近文件末尾的数据包
2. **检查 flush 结果**：确认是否读取到剩余帧
3. **验证时长计算**：对比流 duration 和格式 duration
4. **监控缓冲区状态**：避免缓冲区溢出或下溢

## 参考实现

- **音频播放**: `src-tauri/src/audio.rs`
- **音频转换**: `src-tauri/src/audio_converter.rs`
- **视频播放**: `src-tauri/src/video_player.rs`

## 总结

- ✅ **必须使用** `ffmpeg-next` 库（Rust 绑定）
- ❌ **禁止使用** 命令行方式（`Command::new("ffmpeg")`）
- ⚠️ **谨慎使用** FFI 方式（仅在特殊需求时）
- ✅ **必须 flush** 解码器和重采样器
- ✅ **正确处理** EAGAIN 和 EOF 错误
- ✅ **优先使用** 流级别的 duration

遵循这些规范可以确保代码的一致性、可维护性和正确性。
