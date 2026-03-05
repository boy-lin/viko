"use client";

import type React from "react";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  Upload,
  FileAudio,
  CheckCircle2,
  Settings2,
  Download,
} from "lucide-react";
import { cn, extractFilenameFromPath } from "@/lib/utils";
import { open } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { bridge } from "@/lib/bridge";
import { getBridgeErrorMessage } from "@/lib/bridgeError";

type Step = 1 | 2 | 3;

interface FileInfo {
  name: string;
  size: number;
  type: string;
  duration?: number;
  path?: string;
}

interface ConversionSettings {
  format: string;
  bitrate: number;
  sampleRate: string;
}

interface FileData {
  name: string;
  path: string;
}

export function Mp3Converter() {
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [file, setFile] = useState<FileData | null>(null);
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [settings, setSettings] = useState<ConversionSettings>({
    format: "mp3",
    bitrate: 192,
    sampleRate: "44100",
  });
  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [outputPath, setOutputPath] = useState<string | null>(null);

  // 监听转换进度事件
  // 鐩戝惉杞崲杩涘害浜嬩欢
  useEffect(() => {
    let progressUnlisten: (() => void) | null = null;
    let completeUnlisten: (() => void) | null = null;
    let errorUnlisten: (() => void) | null = null;

    void bridge
      .on("audio-conversion-progress", (payload) => {
        const progress = parseFloat(String(payload).replace("%", ""));
        if (!Number.isNaN(progress)) {
          setConversionProgress(progress);
        }
      })
      .then((unlisten) => {
        progressUnlisten = unlisten;
      });

    void bridge
      .on("audio-conversion-complete", (payload) => {
        setIsConverting(false);
        setCurrentStep(3);
        if (payload) {
          setOutputPath(String(payload));
        }
      })
      .then((unlisten) => {
        completeUnlisten = unlisten;
      });

    void bridge
      .on("audio-conversion-error", (payload) => {
        setIsConverting(false);
        console.error(`杞崲澶辫触:${String(payload)}`);
        alert(`杞崲澶辫触: ${String(payload)}`);
      })
      .then((unlisten) => {
        errorUnlisten = unlisten;
      });

    return () => {
      progressUnlisten?.();
      completeUnlisten?.();
      errorUnlisten?.();
    };
  }, []);

  const handleFileSelect = async () => {
    try {
      const file = await open({
        multiple: false,
        directory: false,
      });

      if (!file) {
        return;
      }

      // 获取文件信息（使用与 FileSelector 相同的 API）
      try {
        const info = await bridge.getMediaInfo<{
          path: string;
          size: number;
          duration: number;
          format: string;
          audio_codec?: string;
          audio_sample_rate?: string;
        }>(file);

        // 从路径获取文件名
        const fileName = extractFilenameFromPath(file);
        const fileType = `audio/${info.format || "unknown"}`;

        setFile({ name: fileName, path: file });
        setFileInfo({
          name: fileName,
          size: info.size,
          type: fileType,
          duration: info.duration,
          path: file,
        });
        setCurrentStep(2);
      } catch (err: any) {
        const msg = getBridgeErrorMessage(err, "读取文件信息失败");
        console.error(msg);
        alert(`获取文件信息失败: ${msg}`);
      }
    } catch (e: any) {
      const msg = e?.message || "文件选择失败";
      console.error(msg);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    // 拖放功能可以保留，但需要从文件路径获取信息
    // 这里简化处理，直接调用文件选择
    await handleFileSelect();
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleConvert = async () => {
    if (!file || !fileInfo) {
      return;
    }

    setIsConverting(true);
    setConversionProgress(0);
    setOutputPath(null);

    try {
      // 获取输入文件路径
      const inputPath = file?.path || fileInfo?.path || file?.name;

      // 调用转换命令（output_path 为 null 表示自动生成）
      await bridge.convertAudioFile({
        input_path: inputPath,
        output_path: null, // null 表示自动生成
        format: settings.format,
        bitrate: settings.bitrate,
        sample_rate: parseInt(settings.sampleRate),
      });

      // 转换完成事件会在 useEffect 中处理
    } catch (err) {
      const msg = getBridgeErrorMessage(err, "转换失败");
      console.error("转换失败:", err);
      setIsConverting(false);
      alert(`转换失败: ${msg}`);
    }
  };

  const steps = [
    { number: 1, title: "选择文件", icon: Upload },
    { number: 2, title: "配置参数", icon: Settings2 },
    { number: 3, title: "转换结果", icon: Download },
  ];

  return (
    <div className="space-y-8">
      {/* 步骤指示器 */}
      <div className="flex items-center justify-between relative">
        <div className="absolute top-5 left-0 right-0 h-0.5 bg-border -z-10" />
        <div
          className="absolute top-5 left-0 h-0.5 bg-primary transition-all duration-500 -z-10"
          style={{ width: `${((currentStep - 1) / 2) * 100}%` }}
        />
        {steps.map((step, _) => {
          const Icon = step.icon;
          const isActive = currentStep === step.number;
          const isCompleted = currentStep > step.number;

          return (
            <div
              key={step.number}
              className="flex flex-col items-center gap-2 bg-background px-2"
            >
              <div
                className={cn(
                  "w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all duration-300",
                  isCompleted &&
                  "bg-primary border-primary text-primary-foreground",
                  isActive && "border-primary text-primary",
                  !isActive &&
                  !isCompleted &&
                  "border-border text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <Icon className="w-5 h-5" />
                )}
              </div>
              <div className="text-center">
                <div
                  className={cn(
                    "text-sm font-semibold transition-colors",
                    isActive || isCompleted
                      ? "text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  STEP {step.number}
                </div>
                <div
                  className={cn(
                    "text-xs font-medium whitespace-nowrap transition-colors",
                    isActive || isCompleted
                      ? "text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {step.title}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 步骤内容 */}
      <Card className="border-2 border-border">
        <CardContent className="p-8">
          {/* 步骤 1: 选择文件 */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  上传音频文件
                </h2>
                <p className="text-muted-foreground">
                  支持 MP3, WAV, FLAC, OGG 等常见音频格式
                </p>
              </div>

              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className="border-2 border-dashed border-border rounded-lg p-12 text-center hover:border-primary transition-colors cursor-pointer bg-muted/30"
                onClick={handleFileSelect}
              >
                <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium text-foreground mb-2">
                  拖拽文件到此处或点击上传
                </p>
                <p className="text-sm text-muted-foreground">
                  支持最大 100MB 的音频文件
                </p>
              </div>

              {fileInfo && (
                <Card className="border-2 border-primary bg-card">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <FileAudio className="w-6 h-6 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground mb-3 truncate">
                          {fileInfo.name}
                        </h3>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <span className="text-muted-foreground">
                              文件大小：
                            </span>
                            <span className="font-medium text-foreground">
                              {formatFileSize(fileInfo.size)}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">
                              格式：
                            </span>
                            <span className="font-medium text-foreground uppercase">
                              {fileInfo.type.split("/")[1] || "Unknown"}
                            </span>
                          </div>
                          {fileInfo.duration && (
                            <div>
                              <span className="text-muted-foreground">
                                时长：
                              </span>
                              <span className="font-medium text-foreground">
                                {formatDuration(fileInfo.duration)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="flex justify-end">
                <Button
                  size="lg"
                  onClick={() => setCurrentStep(2)}
                  disabled={!file}
                  className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold px-8"
                >
                  下一步：配置参数
                </Button>
              </div>
            </div>
          )}

          {/* 步骤 2: 配置转换参数 */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  配置转换参数
                </h2>
                <p className="text-muted-foreground">
                  调整这些参数以优化输出音频质量
                </p>
              </div>

              <div className="space-y-6">
                <div className="space-y-3">
                  <Label
                    htmlFor="format"
                    className="text-base font-semibold text-foreground"
                  >
                    输出格式
                  </Label>
                  <Select
                    value={settings.format}
                    onValueChange={(value) =>
                      setSettings({ ...settings, format: value })
                    }
                  >
                    <SelectTrigger id="format" className="h-12 border-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mp3">MP3</SelectItem>
                      <SelectItem value="wav">WAV</SelectItem>
                      <SelectItem value="flac">FLAC</SelectItem>
                      <SelectItem value="ogg">OGG</SelectItem>
                      <SelectItem value="aac">AAC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="bitrate"
                      className="text-base font-semibold text-foreground"
                    >
                      比特率
                    </Label>
                    <span className="text-sm font-mono font-semibold text-primary">
                      {settings.bitrate} kbps
                    </span>
                  </div>
                  <Slider
                    id="bitrate"
                    min={64}
                    max={320}
                    step={32}
                    value={[settings.bitrate]}
                    onValueChange={([value]) =>
                      setSettings({ ...settings, bitrate: value })
                    }
                    className="py-4"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>64 kbps (较小)</span>
                    <span>320 kbps (最高质量)</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label
                    htmlFor="sampleRate"
                    className="text-base font-semibold text-foreground"
                  >
                    采样率
                  </Label>
                  <Select
                    value={settings.sampleRate}
                    onValueChange={(value) =>
                      setSettings({ ...settings, sampleRate: value })
                    }
                  >
                    <SelectTrigger id="sampleRate" className="h-12 border-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="22050">22050 Hz</SelectItem>
                      <SelectItem value="44100">44100 Hz (CD 质量)</SelectItem>
                      <SelectItem value="48000">48000 Hz</SelectItem>
                      <SelectItem value="96000">96000 Hz (高保真)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Card className="border-2 border-accent/20 bg-accent/5">
                <CardContent className="p-6">
                  <h3 className="font-semibold text-foreground mb-4">
                    转换预览
                  </h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          原始格式：
                        </span>
                        <span className="font-medium text-foreground uppercase">
                          {fileInfo?.type.split("/")[1]}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          原始大小：
                        </span>
                        <span className="font-medium text-foreground">
                          {fileInfo && formatFileSize(fileInfo.size)}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          输出格式：
                        </span>
                        <span className="font-medium text-primary uppercase">
                          {settings.format}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          预计大小：
                        </span>
                        <span className="font-medium text-primary">
                          {fileInfo &&
                            formatFileSize(
                              (fileInfo.duration || 0) * settings.bitrate * 125
                            )}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-between">
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => setCurrentStep(1)}
                  className="font-semibold border-2"
                >
                  上一步
                </Button>
                <Button
                  size="lg"
                  onClick={handleConvert}
                  disabled={isConverting}
                  className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold px-8"
                >
                  {isConverting
                    ? `转换中... ${conversionProgress.toFixed(1)}%`
                    : "开始转换"}
                </Button>
              </div>
            </div>
          )}

          {/* 步骤 3: 转换结果 */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  转换完成！
                </h2>
                <p className="text-muted-foreground">您的音频文件已成功转换</p>
              </div>

              <Card className="border-2 border-primary bg-card">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <FileAudio className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground mb-3 truncate">
                        {fileInfo?.name.replace(/\.[^/.]+$/, "")}.
                        {settings.format}
                      </h3>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground">
                            文件大小：
                          </span>
                          <span className="font-medium text-foreground">
                            {fileInfo &&
                              formatFileSize(
                                (fileInfo.duration || 0) *
                                settings.bitrate *
                                125
                              )}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">格式：</span>
                          <span className="font-medium text-foreground uppercase">
                            {settings.format}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            比特率：
                          </span>
                          <span className="font-medium text-foreground">
                            {settings.bitrate} kbps
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">
                            采样率：
                          </span>
                          <span className="font-medium text-foreground">
                            {settings.sampleRate} Hz
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-4">
                <Button
                  size="lg"
                  className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground font-semibold"
                  onClick={async () => {
                    if (outputPath) {
                      // 打开文件所在文件夹
                      try {
                        await openPath(outputPath);
                      } catch (err) {
                        console.error("打开文件失败:", err);
                      }
                    }
                  }}
                >
                  <Download className="w-5 h-5 mr-2" />
                  {outputPath ? "打开文件位置" : "转换后的文件已保存"}
                </Button>
              </div>

              <div className="flex justify-center">
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => {
                    setCurrentStep(1);
                    setFile(null);
                    setFileInfo(null);
                    setOutputPath(null);
                  }}
                  className="font-semibold border-2"
                >
                  转换新文件
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
