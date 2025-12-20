# 转码问题排查指南

## 问题：转码后的视频无法播放

### 常见原因

1. **格式与编码器不匹配**
   - MP4 需要使用 H.264/H.265 + AAC
   - WebM 需要使用 VP8/VP9 + Opus/Vorbis
   - AVI 可以使用多种编码器，但推荐 H.264 + AAC

2. **缺少格式指定**
   - FFmpeg 需要 `-f` 参数明确指定输出格式
   - 仅依赖文件扩展名可能不够准确

3. **编码器参数不完整**
   - H.264 需要 profile、level、pix_fmt 等参数
   - 某些播放器对编码参数有严格要求

4. **音频编码器不兼容**
   - 不是所有格式都支持 AAC
   - WebM 需要使用 Opus 或 Vorbis

### 排查步骤

#### 1. 检查转码参数

查看应用日志，确认转码参数是否正确：

```bash
# 查看 Tauri 日志
# macOS: ~/Library/Logs/com.figurex/
# Windows: %APPDATA%\com.figurex\logs\
# Linux: ~/.local/share/com.figurex/logs/
```

日志中应包含：
- 输入文件路径
- 输出文件路径
- 输出格式
- 视频编码器
- 音频编码器
- 分辨率
- 码率

#### 2. 验证输出文件

检查输出文件是否存在且大小合理：

```bash
# 检查文件是否存在
ls -lh <输出文件路径>

# 使用 ffprobe 检查文件信息（基本）
ffprobe <输出文件路径>

# 使用 ffprobe 获取详细信息（推荐）
ffprobe -v error -show_format -show_streams <输出文件路径>

# 使用 ffprobe 获取 JSON 格式输出（便于解析）
ffprobe -v error -print_format json -show_format -show_streams <输出文件路径>

# 使用 ffprobe 检查文件是否损坏
ffprobe -v error <输出文件路径> 2>&1 | grep -i error
```

#### 3. 手动测试 FFmpeg 命令

从日志中复制转码命令，手动执行：

```bash
ffmpeg -i <输入文件> -f <格式> -c:v <视频编码器> -c:a <音频编码器> <输出文件>
```

如果手动命令成功，说明参数正确，问题可能在：
- 文件权限
- 磁盘空间
- 输出路径

#### 4. 检查编码器兼容性

不同格式的推荐编码器组合：

| 格式 | 视频编码器 | 音频编码器 | 备注 |
|------|-----------|-----------|------|
| MP4  | libx264   | aac       | 最兼容 |
| MP4  | libx265   | aac       | 更小文件 |
| WebM | libvpx-vp9 | libopus  | Web 标准 |
| AVI  | libx264   | aac       | 兼容性好 |
| MOV  | libx264   | aac       | Apple 格式 |
| MKV  | libx264   | aac       | 容器格式 |

#### 5. 检查播放器支持

某些播放器对编码参数有严格要求：

- **H.264**: 需要 `profile=high`, `level=4.0`, `pix_fmt=yuv420p`
- **VP9**: 需要指定码率或 CRF 值
- **AAC**: 需要指定码率和采样率

### 调试技巧

#### 启用详细日志

在 `src-tauri/src/commands.rs` 中，转码函数已启用 `info` 级别日志：

```rust
cmd.arg("-loglevel").arg("info");
```

#### 检查错误信息

转码失败时，错误信息会包含：
- 编码器错误：`codec` 关键字
- 格式错误：`format` 关键字
- 数据错误：`Invalid data found`

#### 验证文件完整性

使用 `ffprobe` 检查输出文件：

```bash
ffprobe -v error -show_format -show_streams <输出文件>
```

如果 `ffprobe` 无法读取文件，说明文件损坏。

### 常见错误及解决方案

#### 错误：`Invalid data found when processing input`

**原因**: 编码器与容器格式不匹配

**解决**:
1. 检查格式与编码器是否匹配（参考上表）
2. 确保使用 `-f` 参数明确指定格式
3. 尝试使用推荐的编码器组合

#### 错误：`Codec not found`

**原因**: 系统未安装对应的编码器

**解决**:
1. 检查 FFmpeg 支持的编码器：`ffmpeg -encoders`
2. 安装缺失的编码器库
3. 使用系统支持的编码器

#### 错误：`Output file does not exist`

**原因**: 转码失败或文件路径错误

**解决**:
1. 检查输出目录是否存在且有写权限
2. 检查磁盘空间是否充足
3. 查看详细错误日志

#### 错误：视频可以播放但无声音

**原因**: 音频编码器不兼容

**解决**:
1. 检查音频编码器是否支持该格式
2. 尝试使用 AAC（最兼容）
3. 检查音频码率和采样率设置

### 最佳实践

1. **使用推荐的编码器组合**
   - MP4: H.264 + AAC
   - WebM: VP9 + Opus
   - 其他格式参考上表

2. **明确指定格式**
   - 始终使用 `-f` 参数
   - 确保文件扩展名与格式匹配

3. **设置兼容性参数**
   - H.264: `-profile:v high -level 4.0 -pix_fmt yuv420p`
   - 音频: `-b:a 128k -ar 44100`

4. **验证输出文件**
   - 使用 `ffprobe` 检查
   - 在多个播放器中测试

### 获取帮助

如果问题仍然存在：

1. 收集以下信息：
   - 输入文件格式和编码器
   - 输出格式和编码器
   - 完整的错误日志
   - FFmpeg 版本：`ffmpeg -version`

2. 检查 FFmpeg 文档：
   - https://ffmpeg.org/documentation.html
   - https://trac.ffmpeg.org/wiki/Encode/H.264

3. 查看应用日志文件获取详细错误信息

