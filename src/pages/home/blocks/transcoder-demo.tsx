"use client";

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { downloadDir } from "@tauri-apps/api/path";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Upload,
  Play,
  File,
  HardDrive,
  Film,
  MonitorPlay,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Video,
  Headphones,
  Radio,
  Gauge,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { bridge } from "@/lib/bridge";
import { FFmpegConfig, generateFFmpegArgs } from "@/lib/ffmpeg";
import { formatFileSize } from "@/lib/file";
import {
  addTranscodeTask,
  updateTranscodeTask,
  TranscodeStatus,
} from "@/lib/indexed";
import { TranscodeConfigForm } from "@/components/biz-form/TranscodeConfigForm";

type TranscodingStatus = "idle" | "transcoding" | "success" | "error";

interface FileInfo {
  path: string;
  size: number;
  format: string;
  format_long_name?: string;
  codec: string;
  codec_long_name?: string;
  resolution: string;
  width: number;
  height: number;
  duration: number;
  output_dir: string;
  bitrate?: string;
  fps?: string;
  avg_frame_rate?: string;
  nb_frames?: number;
  pix_fmt?: string;
  color_space?: string;
  color_range?: string;
  audio_codec?: string;
  audio_codec_long_name?: string;
  audio_channels?: string;
  audio_channel_layout?: string;
  audio_sample_rate?: string;
  audio_bitrate?: string;
  audio_bits_per_sample?: string;
  audio_sample_fmt?: string;
  format_bitrate?: string;
  format_tags?: Record<string, any>;
}

export function TranscoderDemo() {
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [status, setStatus] = useState<TranscodingStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [error, setError] = useState("");
  const [outputFormat, setOutputFormat] = useState("mp4");
  const [resolution, setResolution] = useState("");
  const [codec, setCodec] = useState("");
  const [bitrate, setBitrate] = useState("");
  const [framerate, setFramerate] = useState("");
  const [outputDir, setOutputDir] = useState("");
  const [outputName, setOutputName] = useState("output");
  const [currentTaskId, setCurrentTaskId] = useState<number | null>(null);
  const navigate = useNavigate();

  // 初始化输出目录
  useEffect(() => {
    if (!outputDir) {
      downloadDir().then((dir) => {
        setOutputDir(dir);
      });
    }
  }, [outputDir]);

  // 监听转码进度事件
  useEffect(() => {
    let unlistenProgress: (() => void) | undefined;
    let unlistenComplete: (() => void) | undefined;

    bridge
      .on("ffmpeg-progress", (payload) => {
        setProgressText(payload);
        // 尝试从进度文本中提取百分比
        const percentMatch = payload.match(/(\d+(?:\.\d+)?)%/);
        if (percentMatch) {
          setProgress(parseFloat(percentMatch[1]));
        }
      })
      .then((off) => {
        unlistenProgress = off;
      });

    bridge
      .on("ffmpeg-complete", () => {
        setStatus("success");
        setProgress(100);
        // 标记当前任务成功
        if (currentTaskId != null) {
          updateTranscodeTask(currentTaskId, {
            status: "success",
          }).catch((e) => {
            console.error("更新任务状态失败:", e);
          });
        }
      })
      .then((off) => {
        unlistenComplete = off;
      });

    return () => {
      unlistenProgress?.();
      unlistenComplete?.();
    };
  }, [currentTaskId]);

  const handleFileSelect = async () => {
    try {
      const file = await open({
        multiple: false,
        directory: false,
      });

      if (!file) {
        return;
      }

      // 获取文件详细信息
      const info = await invoke<FileInfo>("get_media_info", { path: file });
      setFileInfo(info);
      setStatus("idle");
      setProgress(0);
      setProgressText("");
      setError("");
    } catch (e: any) {
      setError(e?.message || "文件选择失败");
    }
  };

  const handleSelectOutputDir = async () => {
    try {
      const selectedDir = await open({
        multiple: false,
        directory: true,
      });

      if (selectedDir) {
        setOutputDir(selectedDir);
      }
    } catch (e: any) {
      console.error("选择文件夹失败:", e);
      setError(e?.message || "选择文件夹失败");
    }
  };

  const handleStartTranscode = async () => {
    if (!fileInfo) return;

    setStatus("transcoding");
    setProgress(0);
    setProgressText("");
    setError("");

    try {
      // 先创建任务记录
      const baseOutputPath = `${outputDir}/${outputName}`;
      const taskId = await addTranscodeTask({
        inputPath: fileInfo.path,
        outputPath: baseOutputPath,
        outputFormat: outputFormat || undefined,
        resolution: resolution || undefined,
        bitrate: bitrate || undefined,
        framerate: framerate || undefined,
        status: "transcoding" as TranscodeStatus,
      });
      setCurrentTaskId(taskId);

      // 生成 ffmpeg 命令
      const params: FFmpegConfig = {
        input: fileInfo.path,
        output: baseOutputPath,
        quality: bitrate ? `${bitrate}k` : undefined,
      };
      if (outputFormat) {
        // 仅当用户选择了输出格式时才设置
        (params as any).format = outputFormat;
      }
      if (resolution) {
        params.resolution = resolution;
      }
      const ffmpegArgs = generateFFmpegArgs(params);

      await bridge.invoke("ffmpeg_exec", { ffmpegArgs });
    } catch (error) {
      console.error("转码时出错:", error);
      const message = error instanceof Error ? error.message : "转码失败";
      setError(message);
      setStatus("error");
      if (currentTaskId != null) {
        updateTranscodeTask(currentTaskId, {
          status: "error",
          errorMessage: message,
        }).catch((e) => {
          console.error("更新任务失败:", e);
        });
      }
    }
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, "0")}`;
    }
  };

  const formatBytes = (bytes: number) => {
    return formatFileSize(bytes);
  };

  const handleGoBatch = () => {
    const params = new URLSearchParams();
    if (outputFormat) params.set("outputFormat", outputFormat);
    if (resolution) params.set("resolution", resolution);
    if (codec) params.set("codec", codec);
    if (bitrate) params.set("bitrate", bitrate);
    if (framerate) params.set("framerate", framerate);
    if (outputDir) params.set("outputDir", outputDir);
    navigate(`/batch?${params.toString()}`);
  };

  return (
    <section id="transcoder-demo" className="relative overflow-hidden">
      <div className="relative z-10 container m-auto px-4">
        <div className="max-w-5xl mx-auto">
          {/* File Upload Area */}
          {!fileInfo ? (
            <Card className="border-2 border-dashed border-primary/30 bg-card/50 backdrop-blur p-12">
              <div
                onClick={handleFileSelect}
                className="flex flex-col items-center justify-center cursor-pointer group"
              >
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <Upload className="w-10 h-10 text-primary" />
                </div>
                <h3 className="text-2xl font-semibold mb-2">
                  Upload Your Video
                </h3>
                <p className="text-muted-foreground mb-4">
                  Click to browse your video file
                </p>
                <p className="text-sm text-muted-foreground">
                  Supports MP4, AVI, MOV, MKV, and 99% of mainstream formats
                </p>
              </div>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-6">
              {/* Video Information Panel */}
              <Card className="bg-card/50 backdrop-blur p-6">
                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <Film className="w-5 h-5 text-primary" />
                  Original Video Information
                </h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <File className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-muted-foreground">File Name</p>
                      <p className="font-medium truncate">
                        {fileInfo.path.split("/").pop() || fileInfo.path}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <HardDrive className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">File Size</p>
                      <p className="font-medium">
                        {formatBytes(fileInfo.size)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Film className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">Format</p>
                      <p className="font-medium">
                        {fileInfo.format.toUpperCase()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Video className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">
                        Video Codec
                      </p>
                      <p className="font-medium">{fileInfo.codec || "N/A"}</p>
                    </div>
                  </div>
                  {fileInfo.bitrate && (
                    <div className="flex items-start gap-3">
                      <Gauge className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm text-muted-foreground">
                          Video Bitrate
                        </p>
                        <p className="font-medium">{fileInfo.bitrate} bps</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-start gap-3">
                    <MonitorPlay className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">
                        Resolution
                      </p>
                      <p className="font-medium">{fileInfo.resolution}</p>
                    </div>
                  </div>
                  {fileInfo.fps && (
                    <div className="flex items-start gap-3">
                      <Play className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm text-muted-foreground">
                          Frame Rate
                        </p>
                        <p className="font-medium">{fileInfo.fps} fps</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-start gap-3">
                    <Clock className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">Duration</p>
                      <p className="font-medium">
                        {formatDuration(fileInfo.duration)}
                      </p>
                    </div>
                  </div>
                  {fileInfo.audio_codec && (
                    <div className="flex items-start gap-3">
                      <Headphones className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm text-muted-foreground">
                          Audio Codec
                        </p>
                        <p className="font-medium">{fileInfo.audio_codec}</p>
                      </div>
                    </div>
                  )}
                  {fileInfo.audio_channels && (
                    <div className="flex items-start gap-3">
                      <Radio className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm text-muted-foreground">
                          Audio Channels
                        </p>
                        <p className="font-medium">{fileInfo.audio_channels}</p>
                      </div>
                    </div>
                  )}
                  {fileInfo.audio_sample_rate && (
                    <div className="flex items-start gap-3">
                      <Gauge className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm text-muted-foreground">
                          Audio Sample Rate
                        </p>
                        <p className="font-medium">
                          {fileInfo.audio_sample_rate} Hz
                        </p>
                      </div>
                    </div>
                  )}
                  {fileInfo.audio_bitrate && (
                    <div className="flex items-start gap-3">
                      <Gauge className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm text-muted-foreground">
                          Audio Bitrate
                        </p>
                        <p className="font-medium">
                          {fileInfo.audio_bitrate} bps
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-4 bg-transparent"
                  onClick={() => {
                    setFileInfo(null);
                    setStatus("idle");
                    setProgress(0);
                    setProgressText("");
                    setError("");
                  }}
                >
                  Choose Different File
                </Button>
              </Card>

              {/* Transcoding Configuration Panel */}
              <TranscodeConfigForm
                title="Transcoding Parameters"
                renderRight={() => (
                  <Button variant="outline" size="sm" onClick={handleGoBatch}>
                    {/* 批量处理图标 */}
                    批量处理
                  </Button>
                )}
                outputFormat={outputFormat}
                onOutputFormatChange={setOutputFormat}
                codec={codec}
                onCodecChange={setCodec}
                resolution={resolution}
                onResolutionChange={setResolution}
                bitrate={bitrate}
                onBitrateChange={setBitrate}
                framerate={framerate}
                onFramerateChange={setFramerate}
                outputName={outputName}
                onOutputNameChange={setOutputName}
                showOutputName
                outputDir={outputDir}
                onOutputDirChange={setOutputDir}
                onSelectOutputDir={handleSelectOutputDir}
              />
            </div>
          )}

          {/* Action Button and Status */}
          {fileInfo && (
            <div className="mt-6 space-y-4">
              <Button
                size="lg"
                className="w-full text-lg py-6 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/50"
                onClick={handleStartTranscode}
                disabled={status === "transcoding"}
              >
                {status === "transcoding" ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Transcoding in Progress...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-5 w-5" />
                    Start Transcoding
                  </>
                )}
              </Button>

              {/* Error Message */}
              {error && (
                <Alert className="bg-destructive/10 border-destructive/30">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  <AlertDescription className="text-foreground ml-2">
                    <strong>Error!</strong> {error}
                  </AlertDescription>
                </Alert>
              )}

              {/* Progress Display */}
              {status === "transcoding" && (
                <Card className="bg-card/50 backdrop-blur p-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        Transcoding Progress
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {progress}%
                      </span>
                    </div>
                    <Progress value={progress} className="h-2" />
                    {progressText && (
                      <p className="text-xs text-muted-foreground">
                        {progressText}
                      </p>
                    )}
                  </div>
                </Card>
              )}

              {/* Success Message */}
              {status === "success" && (
                <Alert className="bg-primary/10 border-primary/30">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <AlertDescription className="text-foreground ml-2">
                    <strong>Transcoding Complete!</strong> Your video has been
                    successfully transcoded and saved to{" "}
                    <span className="font-mono text-primary">
                      {outputDir}/{outputName}.{outputFormat}
                    </span>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
