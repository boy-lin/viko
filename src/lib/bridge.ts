import { emit, listen, UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { ConverterTask } from "@/types/converter";
import { useConverterStore } from "@/stores/converterStore";
import { isAudioFormat } from "@/data/formats";

export type DownloadProgress = {
  stage: string;
  downloaded: number;
  total?: number | null;
};

export type BridgeEvents = {
  "ffmpeg-progress": string;
  "ffmpeg-complete": string;
  "ffmpeg-download-progress": DownloadProgress;
  "ffmpeg-exec": string;
  "video-frame": { width: number; height: number; data: number[] | Uint8Array };
  "video-complete": string;
  "video-error": string;
};

type KnownEvent = keyof BridgeEvents;
type EventPayload<K extends string> = K extends KnownEvent
  ? BridgeEvents[K]
  : unknown;

class Bridge {
  private disposers: UnlistenFn[] = [];
  private fallbackTarget = new EventTarget();
  private tauriReady = true;

  isTauri() {
    return this.tauriReady;
  }

  isTauriEvn() {
    return typeof window !== "undefined" && "__TAURI__" in window;
  }

  async on<K extends string>(
    event: K,
    handler: (payload: EventPayload<K>) => void
  ): Promise<() => void> {
    if (this.tauriReady) {
      const unlisten = await listen<EventPayload<K>>(event, ({ payload }) =>
        handler(payload)
      );
      this.disposers.push(unlisten);
      return () => {
        unlisten();
        this.disposers = this.disposers.filter((fn) => fn !== unlisten);
      };
    }

    const wrapped = (evt: Event) => {
      const detail = (evt as CustomEvent<EventPayload<K>>).detail;
      handler(detail);
    };
    this.fallbackTarget.addEventListener(event, wrapped);
    return () =>
      this.fallbackTarget.removeEventListener(event, wrapped as EventListener);
  }

  async emit<K extends string>(event: K, payload: EventPayload<K>) {
    if (this.tauriReady) {
      await emit(event, payload);
      return;
    }
    this.fallbackTarget.dispatchEvent(
      new CustomEvent<EventPayload<K>>(event, { detail: payload })
    );
  }

  async invoke<T = unknown>(
    cmd: string,
    args?: Record<string, unknown>
  ): Promise<T> {
    if (!this.tauriReady) {
      console.warn(`[bridge] invoke "${cmd}" skipped: not running in Tauri`);
      return Promise.reject(new Error("Tauri runtime unavailable"));
    }
    return invoke<T>(cmd, args);
  }

  clear() {
    this.disposers.forEach((dispose) => dispose());
    this.disposers = [];
  }
}

export const bridge = new Bridge();

class ConversionQueue {
  private queue: ConverterTask[] = [];
  private running = false;
  private concurrency = 1;
  private activeCount = 0;

  add(tasks: ConverterTask[]) {
    // Avoid duplicates
    for (const task of tasks) {
      if (!this.queue.find((t) => t.id === task.id)) {
        this.queue.push(task);
      }
    }
    this.process();
  }

  private async process() {
    if (this.activeCount >= this.concurrency) return;

    if (this.queue.length === 0) {
      this.running = false;
      return;
    }

    this.running = true;
    this.activeCount++;
    const task = this.queue.shift();

    if (task) {
      try {
        await this.runTask(task);
      } catch (error) {
        console.error(`Task ${task.id} failed:`, error);
      } finally {
        this.activeCount--;
        this.process();
      }
    }
  }

  private async runTask(task: ConverterTask) {
    const { updateTaskById, outputPath, incrementUnreadFinishedCount, tasks, setActiveTab } = useConverterStore.getState();
    const outputFormat = task.config?.outputFormat || 'mp4';
    const isAudioTarget = isAudioFormat(outputFormat);

    // Initial Status Update
    updateTaskById(task.id, { status: 'converting', progress: 0 });

    const cleanup = () => {
      if (unlistenProgress) unlistenProgress();
      if (unlistenComplete) unlistenComplete();
      if (unlistenError) unlistenError();
    };

    let unlistenProgress: UnlistenFn | null = null;
    let unlistenComplete: UnlistenFn | null = null;
    let unlistenError: UnlistenFn | null = null;

    return new Promise<void>(async (resolve, reject) => {
      try {
        if (isAudioTarget) {
          unlistenProgress = await listen<string>('audio-conversion-progress', (event) => {
            const progress = parseFloat(event.payload.replace('%', ''));
            if (!isNaN(progress)) {
              updateTaskById(task.id, { progress });
            }
          });

          unlistenComplete = await listen<string>('audio-conversion-complete', (event) => {
            console.log("Audio conversion complete:", event);
            updateTaskById(task.id, {
              status: 'finished',
              progress: 100,
              outputPath: event.payload
            });
            incrementUnreadFinishedCount();
            cleanup();
            resolve();
          });

          unlistenError = await listen<string>('audio-conversion-error', (event) => {
            updateTaskById(task.id, { status: 'error' });
            console.error("Audio conversion failed:", event.payload);
            cleanup();
            resolve(); // Resolve to execute next task even on error
          });

          let finalOutputPath: string | null = null;
          if (outputPath) {
            const separator = outputPath.includes('\\') ? '\\' : '/';
            const stem = task.config?.outputTitle || task.title;
            finalOutputPath = `${outputPath}${separator}${stem}.${outputFormat}`;
            updateTaskById(task.id, { outputPath: finalOutputPath });
          }

          const { useHardwareAcceleration, useUltraFastSpeed } = useConverterStore.getState();
          const audioTrack = task.config?.audioTracks?.[0];

          const args: any = {
            input_path: task.path,
            output_path: finalOutputPath,
            format: outputFormat,
            bitrate: audioTrack?.bitrate ? parseInt(audioTrack.bitrate) : 192,
            use_hardware_acceleration: useHardwareAcceleration,
            use_ultra_fast_speed: useUltraFastSpeed,
            audio_encoder: audioTrack?.encoder
          };
          const sampleRate = audioTrack?.sampleRate;
          if (sampleRate && sampleRate === 'original') {
            args.sample_rate = 0
          } else {
            args.sample_rate = parseInt(sampleRate || '0');
          }

          console.log("Queue invoking convert_audio_file:", args);
          await invoke('convert_audio_file', { args });

        } else if (isImageFormat(outputFormat)) {
          // IMAGE CONVERSION LOGIC
          // updateTaskById(task.id, { status: 'converting', progress: 0 }); // Already done at the start of runTask

          let finalOutputPath: string | null = null;
          if (outputPath) {
            const separator = outputPath.includes('\\') ? '\\' : '/';
            const stem = task.config?.outputTitle || task.title;
            finalOutputPath = `${outputPath}${separator}${stem}.${outputFormat}`;
            updateTaskById(task.id, { outputPath: finalOutputPath });
          }

          const args = {
            input_path: task.path,
            output_path: finalOutputPath,
            width: task.config?.video?.resolution ? parseInt(task.config.video.resolution.split('x')[0]) : null,
            height: task.config?.video?.resolution ? parseInt(task.config.video.resolution.split('x')[1]) : null,
            format: outputFormat,
          };

          console.log("Queue invoking convert_image_file:", args);

          // Image conversion is blocking/async-return, so we await it directly
          // We can maybe simulate progress if needed, but for now 0->100 jump is fine for images
          await invoke('convert_image_file', { args });

          updateTaskById(task.id, {
            status: 'finished',
            progress: 100,
            outputPath: finalOutputPath || ''
          });
          incrementUnreadFinishedCount();
          cleanup();
          resolve();

        } else {
          unlistenProgress = await listen<number>('video-conversion-progress', (event) => {
            const progress = event.payload;
            if (typeof progress === 'number' && !isNaN(progress)) {
              updateTaskById(task.id, { progress });
            }
          });

          unlistenComplete = await listen<string>('audio-conversion-complete', (event) => {
            // Verify this complete event belongs to this task roughly by check title or just assume serial
            // Since we strictly serialize (concurrency=1), we can assume it's ours.
            // IMPORTANT: The backend emits 'audio-conversion-complete' for video too currently based on previous logs? 
            // Wait, ConverterItem.tsx line 146 listens to 'audio-conversion-complete' for VIDEO too.
            if (event.payload.includes(task.config?.outputTitle || task.title)) {
              updateTaskById(task.id, {
                status: 'finished',
                progress: 100,
                outputPath: event.payload
              });
              incrementUnreadFinishedCount();
              cleanup();
              resolve();
            }
          });

          unlistenError = await listen<string>('audio-conversion-error', (event) => {
            updateTaskById(task.id, { status: 'error' });
            cleanup();
            resolve();
          });

          let finalOutputPath: string | null = null;
          if (outputPath) {
            const separator = outputPath.includes('\\') ? '\\' : '/';
            const stem = task.config?.outputTitle || task.title;
            finalOutputPath = `${outputPath}${separator}${stem}.${outputFormat}`;
            updateTaskById(task.id, { outputPath: finalOutputPath });
          }

          const { useHardwareAcceleration, useUltraFastSpeed } = useConverterStore.getState();

          const args: any = {
            input_path: task.path,
            output_path: finalOutputPath,
            format: outputFormat,
            video_encoder: task.config?.video?.encoder || 'h264',
            resolution: task.config?.video?.resolution,
            video_bitrate: task.config?.video?.bitrate && task.config.video.bitrate !== 'auto'
              ? parseInt(task.config.video.bitrate.replace('k', ''))
              : null,
            frame_rate: task.config?.video?.frameRate,
            use_hardware_acceleration: useHardwareAcceleration,
            use_ultra_fast_speed: useUltraFastSpeed,
            audio_encoder: task.config?.audioTracks?.[0]?.encoder
          };

          console.log("Queue invoking convert_video_file:", args);
          await invoke('convert_video_file', { args });
        }
      } catch (error) {
        console.error("Queue Run Task Error", error);
        updateTaskById(task.id, { status: 'error' });
        cleanup();
        resolve();
      }
    });
  }
}

export const converterQueue = new ConversionQueue();
