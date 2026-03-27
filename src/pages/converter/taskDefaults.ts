import {
  AUDIO_CONTAINER_DEFINITIONS,
  AUDIO_ENCODER_DEFINITIONS,
  IMAGE_CONTAINER_DEFINITIONS,
  IMAGE_ENCODER_DEFINITIONS,
  ImageEncoderDefinition,
  VIDEO_CONTAINER_DEFINITIONS,
  VIDEO_ENCODER_DEFINITIONS,
  VideoEncoderDefinition,
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
import { StreamDetails } from "@/types/tasks";

import { ConverterTask } from "./store";

const buildAudioTracksFromStreams = (
  details: MediaDetailsWithResolve,
  codec: AudioEncoderEnum,
  currentTracks?: AudioTrackConfig[],
) => {
  const encoderDefinition = AUDIO_ENCODER_DEFINITIONS[codec];
  const audioStreams = details.streams.filter(
    (stream) => stream.codec_type === "audio",
  );
  const firstAudioStreamIndex = audioStreams[0]?.index;
  const audioStreamIndices = new Set(
    audioStreams.map((stream) => stream.index),
  );

  if (currentTracks && currentTracks.length > 0) {
    const nextTracks = currentTracks
      .map((track) => {
        const nextSourceStreamIndex =
          typeof track.source_stream_index === "number" &&
          audioStreamIndices.has(track.source_stream_index)
            ? track.source_stream_index
            : firstAudioStreamIndex;

        return {
          ...track,
          source_stream_index: nextSourceStreamIndex,
          codec: codec,
        };
      })

    return nextTracks
  }

  const nextTracks = audioStreams.map((stream) => ({
    source_stream_index: stream.index,
    codec,
    sample_rate: encoderDefinition?.defaultSampleRate,
    channels: encoderDefinition?.defaultChannel,
    bitrate: encoderDefinition?.defaultBitrate,
  }));

  return nextTracks.length > 0 ? nextTracks : [];
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


const normalizeTargetFormat = (category: FileType, format?: string) => {
  if (category === FileType.Audio) {
    return AUDIO_SUPPORT_FORMATS.includes(format as FormatEnum)
      ? (format as FormatEnum)
      : FormatEnum.AAC;
  }
  if (category === FileType.Image) {
    return IMAGE_SUPPORT_FORMATS.includes(format as FormatEnum)
      ? (format as FormatEnum)
      : FormatEnum.PNG;
  }

  return VIDEO_SUPPORT_FORMATS.includes(format as FormatEnum)
    ? (format as FormatEnum)
    : FormatEnum.MP4;
};

export const buildTaskDefaultsFromDetails = (
  task: ConverterTask,
  details: MediaDetailsWithResolve,
): Partial<ConverterTask> => {
  const targetCategory = resolveTargetCategory(task);
  const outputTitle = task.outputTitle ?? details.title;
  const format = normalizeTargetFormat(targetCategory, task.args.format);
  const hasAudioStream = details.streams.some(
    (stream) => stream.codec_type === "audio",
  );

  if (targetCategory === FileType.Audio) {
    const currentArgs = task.args as Partial<ConvertAudioTaskArgs>;
    const definition = AUDIO_CONTAINER_DEFINITIONS[format];

    if (!definition) {
      throw new Error(`Unsupported format: ${format}`);
    }

    return {
      mediaDetails: details,
      outputTitle,
      status: hasAudioStream ? "idle" : "unsupported",
      errorMessage: hasAudioStream
        ? undefined
        : "No audio stream found in source media.",
      activeCategory: FileType.Audio,
      taskType: MediaTaskType.ConvertToAudio,
      args: {
        task_id: task.id,
        input_path: details.path,
        ...currentArgs,
        audio_tracks: buildAudioTracksFromStreams(
          details,
          definition.allowedEncoders[0],
          currentArgs.audio_tracks,
        ),
      } as ConvertAudioTaskArgs,
    };
  }

  if (targetCategory === FileType.Image) {
    const currentArgs = task.args as Partial<ConvertImageTaskArgs>;
    const definition = IMAGE_CONTAINER_DEFINITIONS[format];
    if (!definition) {
      throw new Error(`Unsupported format: ${format}`);
    }
    const imageEncoder = currentArgs.image_encoder ?? definition.allowedEncoders[0]
    const encoderDefinition = IMAGE_ENCODER_DEFINITIONS[imageEncoder]
    if (!encoderDefinition) {
      throw new Error(`Unsupported image encoder: ${imageEncoder}`);
    }

    const computedVideoArgs = computeImageArgsByStreams(details.streams, encoderDefinition);

    return {
      mediaDetails: details,
      outputTitle,
      activeCategory: FileType.Image,
      taskType:
        format === FormatEnum.GIF
          ? MediaTaskType.ConvertToAnimatedImage
          : MediaTaskType.ConvertToImage,
      args: {
        task_id: task.id,
        input_path: details.path,
        ...computedVideoArgs,
        ...currentArgs,
        image_encoder: imageEncoder
      } as ConvertImageTaskArgs,
    };
  }

  const currentArgs = task.args as Partial<ConvertVideoTaskArgs>;
  const definition = VIDEO_CONTAINER_DEFINITIONS[format as FormatEnum];
  if (!definition) {
    throw new Error(`Unsupported format: ${format}`);
  }
  const audioEncoder = definition.audio?.allowedEncoders[0]
  if (!audioEncoder) {
    throw new Error(`Unsupported audio encoder: ${audioEncoder}`);
  }
  const videoEncoder = definition.video?.allowedEncoders[0]
  if (!videoEncoder) {
    throw new Error(`Unsupported video encoder: ${videoEncoder}`);
  }

  const encoderDefinition = VIDEO_ENCODER_DEFINITIONS[videoEncoder]
  if (!encoderDefinition) {
    throw new Error(`Unsupported video encoder: ${videoEncoder}`);
  }

  const computedVideoArgs = computeVideoArgsByStreams(details.streams, encoderDefinition);
  
  return {
    mediaDetails: details,
    outputTitle,
    activeCategory: FileType.Video,
    taskType: MediaTaskType.ConvertToVideo,
    args: {
      task_id: task.id,
      input_path: details.path,
      ...computedVideoArgs,
      ...currentArgs,
      video_encoder: videoEncoder,
      audio_tracks: buildAudioTracksFromStreams(
        details,
        audioEncoder,
        currentArgs.audio_tracks,
      ),
    } as ConvertVideoTaskArgs,
  };
};


function computeVideoArgsByStreams(streams: StreamDetails[], encoderDefinition: VideoEncoderDefinition) {
  const primaryVideoStream = streams.find(
    (stream) => stream.codec_type === "video",
  );
  // width:
  // typeof width === "number" && encoderDefinition.maxWidth
  //   ? Math.min(width, encoderDefinition.maxWidth)
  //   : width,
  //   height:
  // typeof height === "number" && encoderDefinition?.maxHeight
  //   ? Math.min(height, encoderDefinition.maxHeight)
  //   : height,

  const resolution = primaryVideoStream?.width && primaryVideoStream?.height
    ? `${primaryVideoStream.width}x${primaryVideoStream.height}`
    : encoderDefinition.defaultResolution?.join("x");
  const frameRate = primaryVideoStream?.frame_rate ?? encoderDefinition.defaultFrameRate;
  const videoBitrate = primaryVideoStream?.bit_rate 
    ? Math.max(1, Math.round(primaryVideoStream?.bit_rate / 1000)) 
    : encoderDefinition.defaultBitrate;

  return {
    resolution,
    frame_rate: frameRate,
    video_bitrate: videoBitrate,
  };
}


function computeImageArgsByStreams(streams: StreamDetails[], encoderDefinition: ImageEncoderDefinition) {
  const primaryVideoStream = streams.find(
    (stream) => stream.codec_type === "video",
  );

  const width = primaryVideoStream?.width ? Math.min(primaryVideoStream?.width, encoderDefinition.maxWidth) : encoderDefinition.defaultWidth;
  const height = primaryVideoStream?.height ? Math.min(primaryVideoStream?.height, encoderDefinition.maxHeight) : encoderDefinition.defaultHeight;
  const frameRate = primaryVideoStream?.frame_rate 

  return {
    width,
    height,
    frame_rate: frameRate,
  };
}
