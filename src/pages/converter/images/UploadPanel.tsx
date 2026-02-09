import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConverterStore } from "./store";
import {
  isAudioFormat,
  isImageFormat,
  isVideoFormat,
} from "@/data/formats";
import { handleDirectoryToFiles } from "@/lib/file";
import { useDragDrop } from "@/lib/drag";
import { MediaTaskType } from "@/types/tasks";
import { UploadDrag } from '@/components/ui-biz/UploadDrag'

type UploadStatus = "queued" | "processing" | "done" | "error";
type UploadKind = "audio" | "video" | "image" | "file";

type UploadItem = {
  id: string;
  name: string;
  path?: string;
  size?: number;
  status: UploadStatus;
  progress: number;
  error?: string;
  kind: UploadKind;
};

const getFileKind = (extension?: string): UploadKind => {
  if (!extension) return "file";
  if (isAudioFormat(extension)) return "audio";
  if (isVideoFormat(extension)) return "video";
  if (isImageFormat(extension)) return "image";
  return "file";
};

export function UploadPanel({
  supportedExtensions,
  mediaType
}: {
  supportedExtensions: string[];
  mediaType: MediaTaskType;
}) {
  const addFilesFromPaths = useConverterStore(
    (state) => state.addFilesFromPaths
  );

  return (
    <UploadDrag
      supportedExtensions={supportedExtensions}
      mediaType={mediaType}
      addFilesFromPaths={addFilesFromPaths}
    />
  );
}
