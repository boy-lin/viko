import { create } from "zustand";
import { MediaDetails } from "@/types/tasks";

export type Metadata = Record<string, string>;

export interface FileInfo {
  path: string;
  format: string;
  size: number;
}

export type MetadataMessage = {
  type: "success" | "error";
  text: string;
};

interface MetadataState {
  fileInfo: FileInfo | null;
  metadata: Metadata;
  streamTags: Record<string, string>[];
  loading: boolean;
  message: MetadataMessage | null;
  details: MediaDetails | null;
  setFileInfo: (fileInfo: FileInfo | null) => void;
  setMetadata: (metadata: Metadata) => void;
  setStreamTags: (streamTags: Record<string, string>[]) => void;
  setLoading: (loading: boolean) => void;
  setMessage: (message: MetadataMessage | null) => void;
  setDetails: (details: MediaDetails | null) => void;
  setMetadataField: (key: string, value: string) => void;
  applyLoadedFile: (path: string, details: MediaDetails & { format: string }) => void;
}

export const useMetadataStore = create<MetadataState>((set) => ({
  fileInfo: null,
  metadata: {},
  streamTags: [],
  loading: false,
  message: null,
  details: null,
  setFileInfo: (fileInfo) => set({ fileInfo }),
  setMetadata: (metadata) => set({ metadata }),
  setStreamTags: (streamTags) => set({ streamTags }),
  setLoading: (loading) => set({ loading }),
  setMessage: (message) => set({ message }),
  setDetails: (details) => set({ details }),
  setMetadataField: (key, value) =>
    set((state) => ({
      metadata: { ...state.metadata, [key]: value },
    })),
  applyLoadedFile: (path, details) =>
    set({
      details,
      fileInfo: {
        path,
        format: details.format,
        size: details.size || 0,
      },
      metadata: details.tags || {},
      streamTags: details.stream_tags || [],
    }),
}));
