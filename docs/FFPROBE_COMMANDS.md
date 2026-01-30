# FFprobe 命令参考

`ffprobe` 是 FFmpeg 工具集的一部分，用于检查媒体文件的信息。

## 基本用法

### 1. 显示文件基本信息

```bash
ffprobe <文件路径>
```

示例：
```bash
ffprobe video.mp4
```

### 2. 显示详细格式和流信息（推荐）

```bash
ffprobe -v error -show_format -show_streams <文件路径>
```

示例：
```bash
ffprobe -v error -show_format -show_streams output.mp4
```

输出包括：
- 格式信息（容器格式、时长、码率等）
- 所有流的信息（视频流、音频流等）
- 编码器、分辨率、帧率等详细信息

### 3. JSON 格式输出（便于程序解析）

```bash
ffprobe -v error -print_format json -show_format -show_streams <文件路径>
```

示例：
```bash
ffprobe -v error -print_format json -show_format -show_streams output.mp4
```

### 4. 检查文件是否损坏

```bash
ffprobe -v error <文件路径> 2>&1 | grep -i error
```

如果没有输出，说明文件正常；如果有错误信息，说明文件可能损坏。

## 常用命令

### 查看视频流信息

```bash
# 只显示视频流
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,r_frame_rate,bit_rate -of default=noprint_wrappers=1 <文件路径>
```

输出示例：
```
codec_name=h264
width=1920
height=1080
r_frame_rate=30/1
bit_rate=5000000
```

### 查看音频流信息

```bash
# 只显示音频流
ffprobe -v error -select_streams a:0 -show_entries stream=codec_name,channels,sample_rate,bit_rate -of default=noprint_wrappers=1 <文件路径>
```

输出示例：
```
codec_name=aac
channels=2
sample_rate=44100
bit_rate=128000
```

### 查看文件时长

```bash
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 <文件路径>
```

输出示例：
```
120.500000
```

### 查看文件大小

```bash
ffprobe -v error -show_entries format=size -of default=noprint_wrappers=1:nokey=1 <文件路径>
```

输出示例（字节数）：
```
15728640
```

### 查看所有编码器信息

```bash
ffprobe -v error -show_entries stream=codec_name,codec_long_name -of default=noprint_wrappers=1 <文件路径>
```

### 查看容器格式信息

```bash
ffprobe -v error -show_entries format=format_name,format_long_name,duration,size,bit_rate -of default=noprint_wrappers=1 <文件路径>
```

## 高级用法

### 比较两个文件的信息

```bash
# 文件1
ffprobe -v error -print_format json -show_format -show_streams input.mp4 > input.json

# 文件2
ffprobe -v error -print_format json -show_format -show_streams output.mp4 > output.json

# 比较（需要安装 jq）
diff <(jq . input.json) <(jq . output.json)
```

### 检查特定编码器

```bash
# 检查是否使用 H.264 编码
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 <文件路径> | grep -q h264 && echo "使用 H.264" || echo "未使用 H.264"
```

### 检查分辨率

```bash
ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 <文件路径>
```

输出示例：
```
1920x1080
```

### 检查帧率

```bash
ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of default=noprint_wrappers=1:nokey=1 <文件路径>
```

输出示例：
```
30/1
```

## 在转码排查中的应用

### 1. 检查转码前的输入文件

```bash
ffprobe -v error -print_format json -show_format -show_streams input.mp4
```

### 2. 检查转码后的输出文件

```bash
ffprobe -v error -print_format json -show_format -show_streams output.webm
```

### 3. 对比转码前后的差异

```bash
# 输入文件信息
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,r_frame_rate -of default=noprint_wrappers=1 input.mp4

# 输出文件信息
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,r_frame_rate -of default=noprint_wrappers=1 output.webm
```

### 4. 验证文件完整性

```bash
# 检查文件是否可以正常读取
ffprobe -v error input.mp4 > /dev/null 2>&1 && echo "文件正常" || echo "文件损坏"
```

## 参数说明

- `-v error`: 只显示错误信息，不显示其他日志
- `-show_format`: 显示容器格式信息
- `-show_streams`: 显示所有流的信息
- `-print_format json`: 以 JSON 格式输出（可选：json, xml, csv, flat, ini）
- `-select_streams v:0`: 只选择第一个视频流
- `-select_streams a:0`: 只选择第一个音频流
- `-show_entries stream=...`: 只显示指定的字段
- `-of default=noprint_wrappers=1:nokey=1`: 输出格式设置（不显示键名，只显示值）

## 常见问题

### Q: 如何检查文件是否支持某个编码器？

```bash
# 检查视频编码器
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 <文件路径>

# 检查音频编码器
ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 <文件路径>
```

### Q: 如何检查文件是否损坏？

```bash
ffprobe -v error <文件路径> 2>&1
```

如果输出为空或只有警告，说明文件正常；如果有错误信息，说明文件可能损坏。

### Q: 如何获取文件的完整技术参数？

```bash
ffprobe -v error -print_format json -show_format -show_streams <文件路径> | jq .
```

需要安装 `jq` 来美化 JSON 输出。

## 在项目中的应用

在转码功能中，可以使用 `ffprobe` 来：

1. **验证转码结果**：检查输出文件是否正确生成
2. **排查问题**：对比输入和输出文件的编码器、格式等信息
3. **调试**：获取详细的文件信息用于问题定位

## 相关资源

- FFprobe 官方文档：https://ffmpeg.org/ffprobe.html
- FFmpeg 文档：https://ffmpeg.org/documentation.html

