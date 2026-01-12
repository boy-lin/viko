import React from 'react';
import { ConverterTask } from '@/types/converter';
import { Button } from '@/components/ui/button';
import {
  FileVideo,
  FileAudio,
  ExternalLink,
  Play,
  Folder,
  MoreHorizontal,
  Wand2,
  Trash2
} from 'lucide-react';
import { useConverterStore } from '@/stores/converterStore';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
interface FinishedItemProps {
  task: ConverterTask;
}

export const FinishedItem: React.FC<FinishedItemProps> = ({ task }) => {
  const { removeTask } = useConverterStore();
  const isVideo = task.streams.some(s => s.codec_type === 'video');

  const handleOpenFolder = async () => {
    console.log('task.outputPath', task);

    if (!task.outputPath) return;
    try {
      await revealItemInDir(task.outputPath);
    } catch (e) {
      console.error("Failed to open folder:", e);
    }
  };

  const handlePlay = async () => {

  };

  // Calculate display info
  // Format: MP4 / GIF
  const format = task.config?.outputFormat.toUpperCase() || task.format.toUpperCase();

  // Bitrate/Resolution
  // If audio: 128 kbps
  // If video: 1280*720
  const resolution = task.config?.video?.resolution === 'original' ? task.displayResolution : task.config?.video?.resolution;
  // Audio bitrate
  const audioBitrate = task.config?.audioTracks?.[0]?.bitrate || '192k';

  const displayInfo2 = isVideo ? resolution : `${audioBitrate}`;

  return (
    <div className="bg-white dark:bg-card border border-border rounded-xl p-4 flex gap-4 items-center group hover:shadow-sm transition-shadow">
      {/* Thumbnail / Icon */}
      <div className="w-24 h-16 bg-purple-100 dark:bg-purple-900/20 rounded-lg flex items-center justify-center shrink-0 relative overflow-hidden">
        {/* Placeholder for real thumbnail if available, else icon */}
        <div className="flex items-center justify-center text-purple-600 dark:text-purple-400">
          {isVideo ? <FileVideo className="w-8 h-8" /> : <FileAudio className="w-8 h-8" />}
        </div>
        {/* Play overlay on hover? */}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0 mr-4">
            <div className="flex items-center gap-2 mb-1">
              {isVideo && (
                <FileVideo className="w-4 h-4 text-muted-foreground" />
              )}
              {!isVideo && (
                <FileAudio className="w-4 h-4 text-muted-foreground" />
              )}
              <h3 className="text-base font-semibold text-foreground truncate" title={task.config?.outputTitle}>
                {task.config?.outputTitle}
              </h3>
              <button onClick={handlePlay} className="text-muted-foreground hover:text-foreground">
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>

            <div className="flex items-center gap-6 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                {isVideo ? <FileVideo className="w-3 h-3" /> : <FileAudio className="w-3 h-3" />}
                <span className="uppercase">{format}</span>
              </div>

              <div className="flex items-center gap-1.5">
                {isVideo ? (
                  <>
                    <span className="w-3 h-3 border border-current rounded-[1px]" />
                    <span>{displayInfo2}</span>
                  </>
                ) : (
                  <>
                    <div className="w-3 h-3 rounded-full border border-current flex items-center justify-center text-[8px]">kb</div>
                    <span>{displayInfo2}</span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <Folder className="w-3 h-3" />
                <span>{task.displaySize}</span> {/* Note: Size might change after conversion, but we only have input size currently unless updated */}
              </div>

              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full border border-current flex items-center justify-center">
                  <div className="w-1.5 h-0.5 bg-current" />
                </div>
                <span>
                  {new Date(task.duration * 1000).toISOString().substr(11, 8)}
                </span>
              </div>
            </div>
          </div>

          {/* Actions Right */}
          <div className="flex items-center gap-2">
            {/* Placeholder for "Improve Clarity" functionality shown in design */}
            {/* 
                        <Button variant="outline" size="sm" className="h-8 text-purple-600 border-purple-200 hover:bg-purple-50 dark:hover:bg-purple-900/20">
                            <Wand2 className="w-3 h-3 mr-2" />
                            Improve Clarity
                        </Button>
                         */}
          </div>
        </div>

        {/* Bottom Action Row (condensed in design, usually hidden or on hover?) 
                    The design shows "Improve Clarity" button below title for one item, but side for others? 
                    Actually design shows:
                    Row 1: Title + External Link
                    Row 2: Metadata
                    Row 3 (Optional): "Improve Clarity" button
                 */}
        <div className="mt-3">
          <Button variant="outline" size="sm" className="h-8 text-indigo-600 border-indigo-200 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 gap-1.5">
            <Wand2 className="w-3.5 h-3.5" />
            Improve Clarity
          </Button>
        </div>
      </div>

      {/* Far Right Actions */}
      <div className="flex flex-col items-end gap-2 self-center">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={handleOpenFolder} title="Open Folder">
            <Folder className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={handlePlay} title="Play">
            <Play className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" title="More">
            <MoreHorizontal className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-500 hover:bg-red-50" onClick={() => removeTask(task.id)} title="Delete">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
