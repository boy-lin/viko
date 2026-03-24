import {
  AUDIO_CONTAINER_DEFINITIONS,
  IMAGE_CONTAINER_DEFINITIONS,
  IMAGE_ENCODER_DEFINITIONS,
  VIDEO_CONTAINER_DEFINITIONS,
} from "@/data/capabilities";
import {
  AUDIO_SUPPORT_FORMATS,
  IMAGE_SUPPORT_FORMATS,
  VIDEO_SUPPORT_FORMATS,
} from "@/data/formats";
import {
  AudioTrackConfig,
  ConvertAudioTaskArgs,
  ConvertImageTaskArgs,
  ConvertVideoTaskArgs,
} from "@/lib/mediaTaskEvent";
import { AudioEncoderEnum, FormatEnum } from "@/types/options";
import {
  FileType,
  MediaDetailsWithResolve,
  MediaTaskType,
} from "@/types/tasks";

import { ConverterTask } from "./store";

const buildAudioTracksFromStreams = (
  details: MediaDetailsWithResolve,
  currentTracks: AudioTrackConfig[] | undefined,
  codec: AudioEncoderEnum | string | undefined,
) => {
  const audioStreams = details.streams.filter(
    (stream) => stream.codec_type === "audio",
  );
  const firstAudioStreamIndex = audioStreams[0]?.index;
  const audioStreamIndices = new Set(
    audioStreams.map((stream) => stream.index),
  );

  console.log("nextTracks", currentTracks, audioStreams);
  if (currentTracks && currentTracks.length > 0) {
    const nextTracks = currentTracks
      .map((track) => {
        const nextSourceStreamIndex =
          typeof track.source_stream_index === "number" &&
          audioStreamIndices.has(track.source_stream_index)
            ? track.source_stream_index
            : firstAudioStreamIndex;

        if (typeof nextSourceStreamIndex !== "number") {
          return null;
        }

        return {
          ...track,
          source_stream_index: nextSourceStreamIndex,
          codec: codec ?? track.codec,
        };
      })
      .filter((track) => track !== null);

    if (nextTracks.length > 0) {
      return nextTracks;
    }
  }

  const nextTracks = audioStreams.map((stream) => ({
    source_stream_index: stream.index,
    codec,
  }));
  console.log("nextTracks", nextTracks);
  return nextTracks.length > 0
    ? nextTracks
    : [{ source_stream_index: 0, codec }];
};

export const resolveTargetCategory = (task: ConverterTask): FileType => {
  if (
    task.activeCategory === FileType.Video ||
    task.activeCategory === FileType.Audio ||
    task.activeCategory === FileType.Image
  ) {
    return task.activeCategory;
  }

  if (task.taskType === MediaTaskType.ConvertToAudio) {
    return FileType.Audio;
  }
  if (
    task.taskType === MediaTaskType.ConvertToImage ||
    task.taskType === MediaTaskType.ConvertToAnimatedImage
  ) {
    return FileType.Image;
  }
  return FileType.Video;
};

export const buildTaskDefaultsFromDetails = (
  task: ConverterTask,
  details: MediaDetailsWithResolve,
): Partial<ConverterTask> => {
  const targetCategory = resolveTargetCategory(task);
  const outputTitle = task.outputTitle ?? details.title;
  if (targetCategory === FileType.Audio) {
    console.log("buildTaskDefaultsFromDetails", targetCategory);

    const currentArgs = task.args as Partial<ConvertAudioTaskArgs>;
    let format = currentArgs.format;
    if (!AUDIO_SUPPORT_FORMATS.includes(format as FormatEnum)) {
      format =
        details.extension === FormatEnum.MP3 ? FormatEnum.WAV : FormatEnum.MP3;
    }
    const definition = AUDIO_CONTAINER_DEFINITIONS[format as FormatEnum];

    return {
      mediaDetails: details,
      outputTitle,
      activeCategory: FileType.Audio,
      taskType: MediaTaskType.ConvertToAudio,
      args: {
        ...currentArgs,
        task_id: task.id,
        input_path: details.path,
        format,
        audio_tracks: buildAudioTracksFromStreams(
          details,
          currentArgs.audio_tracks,
          definition?.allowedEncoders[0],
        ),
      } as ConvertAudioTaskArgs,
    };
  }

  if (targetCategory === FileType.Image) {
    const currentArgs = task.args as Partial<ConvertImageTaskArgs>;
    const format = IMAGE_SUPPORT_FORMATS.includes(
      currentArgs.format as FormatEnum,
    )
      ? currentArgs.format
      : (details.extension?.toLowerCase() as FormatEnum) || FormatEnum.PNG;
    const definition = IMAGE_CONTAINER_DEFINITIONS[format as FormatEnum];
    const imageEncoder =
      currentArgs.image_encoder ?? definition?.allowedEncoders[0];
    const encoderDefinition =
      imageEncoder && imageEncoder in IMAGE_ENCODER_DEFINITIONS
        ? IMAGE_ENCODER_DEFINITIONS[
            imageEncoder as keyof typeof IMAGE_ENCODER_DEFINITIONS
          ]
        : undefined;
    const primaryVisualStream =
      details.streams.find((stream) => stream.codec_type === "video") ??
      details.streams[0];
    const width = currentArgs.width ?? primaryVisualStream?.width;
    const height = currentArgs.height ?? primaryVisualStream?.height;

    return {
      mediaDetails: details,
      outputTitle,
      activeCategory: FileType.Image,
      taskType:
        format === FormatEnum.GIF
          ? MediaTaskType.ConvertToAnimatedImage
          : MediaTaskType.ConvertToImage,
      args: {
        ...currentArgs,
        task_id: task.id,
        input_path: details.path,
        format,
        image_encoder: imageEncoder,
        width:
          typeof width === "number" && encoderDefinition?.maxWidth
            ? Math.min(width, encoderDefinition.maxWidth)
            : width,
        height:
          typeof height === "number" && encoderDefinition?.maxHeight
            ? Math.min(height, encoderDefinition.maxHeight)
            : height,
        frame_rate: currentArgs.frame_rate ?? primaryVisualStream?.frame_rate,
      } as ConvertImageTaskArgs,
    };
  }

  const currentArgs = task.args as Partial<ConvertVideoTaskArgs>;
  const format = VIDEO_SUPPORT_FORMATS.includes(
    currentArgs.format as FormatEnum,
  )
    ? currentArgs.format
    : (details.extension?.toLowerCase() as FormatEnum) || FormatEnum.MP4;
  const definition = VIDEO_CONTAINER_DEFINITIONS[format as FormatEnum];
  const primaryVideoStream = details.streams.find(
    (stream) => stream.codec_type === "video",
  );
  return {
    mediaDetails: details,
    outputTitle,
    activeCategory: FileType.Video,
    taskType: MediaTaskType.ConvertToVideo,
    args: {
      task_id: task.id,
      input_path: details.path,
      format,
      video_encoder: definition?.video?.allowedEncoders[0],
      resolution:
        primaryVideoStream?.width && primaryVideoStream?.height
          ? `${primaryVideoStream.width}x${primaryVideoStream.height}`
          : undefined,
      frame_rate: primaryVideoStream?.frame_rate,
      video_bitrate: primaryVideoStream?.bit_rate
        ? primaryVideoStream?.bit_rate / 1000
        : undefined,
      ...currentArgs,
      audio_tracks: buildAudioTracksFromStreams(
        details,
        currentArgs.audio_tracks,
        definition?.audio?.allowedEncoders[0],
      ),
    } as ConvertVideoTaskArgs,
  };
};
