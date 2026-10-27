import { ALL_FORMATS, Input, UrlSource } from 'mediabunny';

/** Length of an audio or video file in seconds, read from its metadata (decoded if it has none). */
export async function mediaDuration(url: string): Promise<number> {
  const input = new Input({ formats: ALL_FORMATS, source: new UrlSource(url) });
  try {
    return (await input.getDurationFromMetadata()) ?? (await input.computeDuration());
  } finally {
    input.dispose();
  }
}

/** Channels in the primary audio track of `url`. */
export async function audioChannels(url: string): Promise<number> {
  const input = new Input({ formats: ALL_FORMATS, source: new UrlSource(url) });
  try {
    const audio = await input.getPrimaryAudioTrack();
    return audio?.numberOfChannels ?? 1;
  } finally {
    input.dispose();
  }
}

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
}

export async function videoInfo(url: string): Promise<VideoInfo> {
  const input = new Input({ formats: ALL_FORMATS, source: new UrlSource(url) });
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error('Input has no video track.');
    return {
      duration: (await video.getDurationFromMetadata()) ?? (await video.computeDuration()),
      width: video.displayWidth,
      height: video.displayHeight,
    };
  } finally {
    input.dispose();
  }
}
