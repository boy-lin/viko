# 修复 "Read-only file system" 错误

## 问题描述

在生产包中下载 FFmpeg 模块时出现错误：
```
创建模块目录失败: Read-only file system (os error 30)
```

## 问题原因

原来的 `resources_root()` 函数使用硬编码的 `"resources"` 路径，这在生产环境中指向应用包内的资源目录，是只读的。

```rust
// 旧代码（有问题）
fn resources_root() -> PathBuf {
    PathBuf::from("resources")  // 指向应用包内，只读
}
```

## 解决方案

修改 `resources_root()` 函数，使用系统提供的可写应用数据目录：

```rust
// 新代码（已修复）
fn resources_root() -> PathBuf {
    // 使用应用数据目录，确保在生产环境中可写
    // macOS: ~/Library/Application Support/audio_video_kit/resources
    // Windows: %APPDATA%\audio_video_kit\resources
    // Linux: ~/.local/share/audio_video_kit/resources
    let base = dirs::data_local_dir()
        .or_else(|| dirs::data_dir())
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("audio_video_kit").join("resources")
}
```

## 目录位置

修复后，FFmpeg 模块将下载到以下位置：

### macOS
```
~/Library/Application Support/audio_video_kit/resources/ffmpeg/<version>/
```

### Windows
```
%APPDATA%\audio_video_kit\resources\ffmpeg\<version>\
```
完整路径示例：
```
C:\Users\<用户名>\AppData\Roaming\audio_video_kit\resources\ffmpeg\6.1.1\
```

### Linux
```
~/.local/share/audio_video_kit/resources/ffmpeg/<version>/
```

## 其他解决方案（备选）

如果上述方案仍有问题，可以考虑以下备选方案：

### 方案 2: 使用用户文档目录

```rust
fn resources_root() -> PathBuf {
    let base = dirs::document_dir()
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("audio_video_kit").join("resources")
}
```

### 方案 3: 使用临时目录（不推荐，重启后丢失）

```rust
fn resources_root() -> PathBuf {
    std::env::temp_dir().join("audio_video_kit").join("resources")
}
```

### 方案 4: 使用 Downloads 目录

```rust
fn resources_root() -> PathBuf {
    dirs::download_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("audio_video_kit")
        .join("resources")
}
```

## 验证修复

1. 重新编译应用
2. 在生产包中测试下载功能
3. 检查文件是否成功下载到新的目录位置

## 注意事项

- 确保应用有权限访问和写入应用数据目录
- 首次运行时，目录会自动创建
- 如果目录已存在但不可写，需要检查文件系统权限

