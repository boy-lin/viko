// ffmpeg 命令生成工具 Cursor Write It

export interface FFmpegConfig {
  input: string;
  output: string;
  resolution?: string;
  quality?: string;
  format?: string;
}

export function generateFFmpegCommand(config: FFmpegConfig): string {
  let cmd = `-i "${config.input}"`; // Cursor Write It
  if (config.resolution && config.resolution !== "custom") {
    cmd += ` -s ${config.resolution}`; // Cursor Write It
  }
  if (config.quality) {
    cmd += ` -b:v ${config.quality}`; // Cursor Write It
  }
  cmd += ` "${config.output}.${config.format}"`; // Cursor Write It
  return cmd; // Cursor Write It
}

export function generateFFmpegArgs(config: FFmpegConfig): string[] {
  let args = ["-i"];
  args.push(config.input);
  if (config.resolution && config.resolution !== "custom") {
    args.push("-s");
    args.push(config.resolution);
  }
  if (config.quality) {
    args.push("-b:v");
    args.push(config.quality);
  }
  // 如果未指定格式，则保持原始扩展名/由调用方自行处理
  const formatSuffix = config.format ? `.${config.format}` : "";
  args.push(`${config.output}${formatSuffix}`);

  return args;
}
