import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Upload,
  Play,
  Film,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  FolderOpen,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { TranscodeConfigForm } from "@/components/biz-form/TranscodeConfigForm";
import {
  addTranscodeTask,
  updateTranscodeTask,
  TranscodeStatus,
} from "@/lib/indexed";
import { downloadDir } from "@tauri-apps/api/path";
import { bridge } from "@/lib/bridge";
import { generateFFmpegArgs, FFmpegConfig } from "@/lib/ffmpeg";

type TranscodingStatus =
  | "pending"
  | "transcoding"
  | "success"
  | "error"
  | "paused";

interface VideoFile {
  id: string;
  /** 文件完整路径（来自 Tauri open） */
  path: string;
  /** 文件名（从 path 提取） */
  name: string;
  /** 文件大小（暂时未知，可选） */
  size?: number;
  status: TranscodingStatus;
  progress: number;
  error?: string;
  /** 输出文件路径（转码成功后） */
  outputPath?: string;
}

export default function BatchPage() {
  const [files, setFiles] = useState<VideoFile[]>([]);
  const [outputFormat, setOutputFormat] = useState("mp4");
  const [resolution, setResolution] = useState("");
  const [codec, setCodec] = useState("");
  const [bitrate, setBitrate] = useState("");
  const [framerate, setFramerate] = useState("");
  const [outputDir, setOutputDir] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchParams] = useSearchParams();

  // 从 URL 中加载配置参数（只在首次挂载时执行一次）
  useEffect(() => {
    const fmt = searchParams.get("outputFormat");
    const res = searchParams.get("resolution");
    const c = searchParams.get("codec");
    const br = searchParams.get("bitrate");
    const fr = searchParams.get("framerate");

    if (fmt) setOutputFormat(fmt);
    if (res) setResolution(res);
    if (c) setCodec(c);
    if (br) setBitrate(br);
    if (fr) setFramerate(fr);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 初始化输出目录
  useEffect(() => {
    const outDir = searchParams.get("outputDir");
    if (!outDir) {
      downloadDir().then((dir) => {
        setOutputDir(dir);
      });
    } else {
      setOutputDir(outDir);
    }
  }, [outputDir]);

  const handleFileSelect = async () => {
    try {
      const result = await open({
        multiple: true,
        directory: false,
        filters: [
          {
            name: "Videos",
            extensions: ["mp4", "avi", "mov", "mkv", "webm"],
          },
        ],
      });

      if (!result) return;

      const paths = Array.isArray(result) ? result : [result];

      const newFiles: VideoFile[] = paths.map((path) => {
        const name = path.split(/[/\\]/).pop() ?? path;
        return {
          id: Math.random().toString(36).slice(2, 11),
          path,
          name,
          status: "pending" as TranscodingStatus,
          progress: 0,
        };
      });

      setFiles((prev) => [...prev, ...newFiles]);
    } catch (e) {
      console.error("选择文件失败:", e);
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleStartBatchTranscode = async () => {
    setIsProcessing(true);

    // 顺序处理每个文件
    for (const file of files) {
      if (file.status === "success") continue;

      // 计算输出文件路径（包含格式扩展名）
      const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
      const outputFileName = outputFormat
        ? `${fileNameWithoutExt}.${outputFormat}`
        : file.name;
      const outputPath = `${outputDir}/${outputFileName}`;
      const baseOutputPath = `${outputDir}/${fileNameWithoutExt}`;

      // 为当前文件创建任务记录
      let taskId: number | null = null;
      try {
        taskId = await addTranscodeTask({
          inputPath: file.path,
          outputPath: baseOutputPath,
          outputFormat: outputFormat || undefined,
          resolution: resolution || undefined,
          bitrate: bitrate || undefined,
          framerate: framerate || undefined,
          status: "transcoding" as TranscodeStatus,
        });
      } catch (e) {
        console.error("创建批量转码任务记录失败:", e);
      }

      // 更新文件状态为转码中
      setFiles((prev) =>
        prev.map((f) =>
          f.id === file.id
            ? { ...f, status: "transcoding" as TranscodingStatus, progress: 0 }
            : f
        )
      );

      // 设置当前处理的文件 ID，用于进度更新
      const currentFileId = file.id;

      // 监听转码进度和完成事件
      let unlistenProgress: (() => void) | undefined;
      let unlistenComplete: (() => void) | undefined;

      try {
        // 监听进度事件
        unlistenProgress = await bridge.on("ffmpeg-progress", (payload) => {
          // 尝试从进度文本中提取百分比
          const percentMatch = payload.match(/(\d+(?:\.\d+)?)%/);
          if (percentMatch) {
            const progress = parseFloat(percentMatch[1]);
            setFiles((prev) =>
              prev.map((f) =>
                f.id === currentFileId
                  ? { ...f, progress: Math.min(progress, 99) }
                  : f
              )
            );
          }
        });

        // 监听完成事件
        let completed = false;
        let resolveComplete: (() => void) | null = null;
        let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

        unlistenComplete = await bridge.on("ffmpeg-complete", (payload) => {
          if (completed) return; // 防止重复处理
          completed = true;

          // 清除超时定时器
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
            timeoutHandle = null;
          }

          const isError =
            typeof payload === "string" && payload.startsWith("error:");
          const errorMessage = isError
            ? payload.replace("error: ", "")
            : undefined;

          // 更新文件状态
          setFiles((prev) =>
            prev.map((f) =>
              f.id === currentFileId
                ? {
                    ...f,
                    progress: 100,
                    status: isError
                      ? ("error" as TranscodingStatus)
                      : ("success" as TranscodingStatus),
                    error: errorMessage,
                    outputPath: isError ? undefined : outputPath,
                  }
                : f
            )
          );

          // 更新任务记录
          if (taskId != null) {
            updateTranscodeTask(taskId, {
              status: (isError ? "error" : "success") as TranscodeStatus,
              errorMessage,
            }).catch((e) => {
              console.error("更新批量转码任务记录失败:", e);
            });
          }

          // 清理事件监听
          unlistenProgress?.();
          unlistenComplete?.();

          // 触发完成
          if (resolveComplete) {
            resolveComplete();
          }
        });

        // 生成 FFmpeg 参数
        const params: FFmpegConfig = {
          input: file.path,
          output: baseOutputPath,
          quality: bitrate ? `${bitrate}k` : undefined,
        };
        if (outputFormat) {
          params.format = outputFormat;
        }
        if (resolution) {
          params.resolution = resolution;
        }
        const ffmpegArgs = generateFFmpegArgs(params);

        // 调用转码命令（异步，不等待完成）
        bridge.invoke("ffmpeg_exec", { ffmpegArgs }).catch((error) => {
          // 如果调用失败，直接标记为错误
          if (!completed) {
            completed = true;
            const message =
              error instanceof Error ? error.message : "转码调用失败";

            setFiles((prev) =>
              prev.map((f) =>
                f.id === currentFileId
                  ? {
                      ...f,
                      status: "error" as TranscodingStatus,
                      error: message,
                    }
                  : f
              )
            );

            if (taskId != null) {
              updateTranscodeTask(taskId, {
                status: "error" as TranscodeStatus,
                errorMessage: message,
              }).catch((e) => {
                console.error("更新批量转码任务记录失败:", e);
              });
            }

            unlistenProgress?.();
            unlistenComplete?.();
            if (resolveComplete) {
              resolveComplete();
            }
          }
        });

        // 等待完成事件（最多等待 30 分钟）
        await new Promise<void>((resolve) => {
          resolveComplete = resolve;
          timeoutHandle = setTimeout(() => {
            if (!completed) {
              // 超时处理
              completed = true;
              setFiles((prev) =>
                prev.map((f) =>
                  f.id === currentFileId
                    ? {
                        ...f,
                        status: "error" as TranscodingStatus,
                        error: "转码超时（超过30分钟）",
                      }
                    : f
                )
              );
              if (taskId != null) {
                updateTranscodeTask(taskId, {
                  status: "error" as TranscodeStatus,
                  errorMessage: "转码超时（超过30分钟）",
                }).catch((e) => {
                  console.error("更新批量转码任务记录失败:", e);
                });
              }
              unlistenProgress?.();
              unlistenComplete?.();
              resolve();
            }
          }, 1800000); // 30 分钟超时
        });
      } catch (error) {
        console.error(`转码文件 ${file.name} 时出错:`, error);
        const message = error instanceof Error ? error.message : "转码失败";

        // 更新文件状态为错误
        setFiles((prev) =>
          prev.map((f) =>
            f.id === currentFileId
              ? {
                  ...f,
                  status: "error" as TranscodingStatus,
                  error: message,
                }
              : f
          )
        );

        // 更新任务记录
        if (taskId != null) {
          updateTranscodeTask(taskId, {
            status: "error" as TranscodeStatus,
            errorMessage: message,
          }).catch((e) => {
            console.error("更新批量转码任务记录失败:", e);
          });
        }

        // 清理事件监听
        unlistenProgress?.();
        unlistenComplete?.();
      }
    }

    setIsProcessing(false);
  };

  const getStatusBadge = (status: TranscodingStatus) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary">等待中</Badge>;
      case "transcoding":
        return (
          <Badge className="bg-primary/20 text-primary">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            转码中
          </Badge>
        );
      case "success":
        return (
          <Badge className="bg-green-500/20 text-green-700 dark:text-green-400">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            完成
          </Badge>
        );
      case "error":
        return (
          <Badge className="bg-destructive/20 text-destructive">
            <AlertCircle className="w-3 h-3 mr-1" />
            失败
          </Badge>
        );
      default:
        return null;
    }
  };

  const completedCount = files.filter((f) => f.status === "success").length;
  const errorCount = files.filter((f) => f.status === "error").length;
  const overallProgress =
    files.length > 0
      ? Math.round(files.reduce((sum, f) => sum + f.progress, 0) / files.length)
      : 0;

  return (
    <section className="relative py-24 overflow-hidden min-h-screen">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-card/50 to-background" />
      <div className="absolute top-1/2 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[120px]" />

      <div className="relative z-10 container mx-auto px-4">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 text-balance">
            批量视频<span className="text-primary">转码</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto text-pretty">
            同时处理多个视频文件，提高工作效率
          </p>
        </div>

        <div className="max-w-6xl mx-auto space-y-6">
          {/* Configuration Panel */}
          <TranscodeConfigForm
            title="批量转码参数配置"
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
            showOutputName={false}
            outputDir={outputDir}
            onOutputDirChange={setOutputDir}
            disabled={isProcessing}
            bodyClassNames="flex gap-4 flex-wrap"
          />

          {/* File Upload Area */}
          <button
            type="button"
            className="flex flex-col items-center justify-center cursor-pointer group w-full border-2 border-dashed border-primary/30 bg-card/50 backdrop-blur p-8"
            onClick={handleFileSelect}
            disabled={isProcessing}
          >
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
              <Upload className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-xl font-semibold mb-2">选择多个视频文件</h3>
            <p className="text-muted-foreground mb-2">
              点击以通过系统对话框选择多个视频文件
            </p>
            <p className="text-sm text-muted-foreground">
              支持 MP4, AVI, MOV, MKV 等主流格式
            </p>
          </button>

          {/* Overall Progress */}
          {files.length > 0 && (
            <Card className="bg-card/50 backdrop-blur p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold">总体进度</h3>
                  <p className="text-sm text-muted-foreground">
                    {completedCount} / {files.length} 个文件已完成
                    {errorCount > 0 && ` • ${errorCount} 个失败`}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-primary">
                    {overallProgress}%
                  </div>
                </div>
              </div>
              <Progress value={overallProgress} className="h-3" />
            </Card>
          )}

          {/* File List */}
          {files.length > 0 && (
            <div className="space-y-3">
              {files.map((videoFile) => (
                <Card
                  key={videoFile.id}
                  className="bg-card/50 backdrop-blur p-4"
                >
                  <div className="flex items-start gap-4">
                    {/* File Icon */}
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Film className="w-6 h-6 text-primary" />
                    </div>

                    {/* File Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold truncate mb-1">
                            {videoFile.name}
                          </h4>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            {/* <span className="flex items-center gap-1">
                              <HardDrive className="w-3 h-3" />
                              {videoFile.size != null
                                ? formatBytes(videoFile.size)
                                : "Unknown"}
                            </span> */}
                            <span className="flex items-center gap-1">
                              <Film className="w-3 h-3" />
                              {videoFile.name.split(".").pop()?.toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(videoFile.status)}
                          {videoFile.status === "pending" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => removeFile(videoFile.id)}
                              disabled={isProcessing}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Progress Bar */}
                      {(videoFile.status === "transcoding" ||
                        videoFile.status === "success") && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">
                              转码进度
                            </span>
                            <span className="font-medium">
                              {videoFile.progress}%
                            </span>
                          </div>
                          <Progress
                            value={videoFile.progress}
                            className="h-1.5"
                          />
                        </div>
                      )}

                      {/* Output Path (Success Only) */}
                      {videoFile.status === "success" &&
                        videoFile.outputPath && (
                          <div className="mt-2 flex items-start gap-2 text-xs">
                            <FolderOpen className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="text-muted-foreground">
                                输出路径：
                              </span>
                              <span className="font-mono text-foreground break-all">
                                {videoFile.outputPath}
                              </span>
                            </div>
                          </div>
                        )}

                      {/* Error Message */}
                      {videoFile.status === "error" && videoFile.error && (
                        <Alert className="mt-2 py-2 bg-destructive/10 border-destructive/30">
                          <AlertCircle className="h-4 w-4 text-destructive" />
                          <AlertDescription className="text-xs ml-2 text-foreground">
                            {videoFile.error}
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Action Buttons */}
          {files.length > 0 && (
            <div className="flex gap-4">
              <Button
                size="lg"
                className="flex-1 text-lg py-6 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/50"
                onClick={handleStartBatchTranscode}
                disabled={
                  isProcessing || files.every((f) => f.status === "success")
                }
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    批量转码中...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-5 w-5" />
                    开始批量转码
                  </>
                )}
              </Button>
              {!isProcessing && files.some((f) => f.status !== "pending") && (
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => setFiles([])}
                  className="px-8"
                >
                  清空列表
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
