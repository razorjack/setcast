import { ALL_FORMATS, FilePathSource, Input, UrlSource } from 'mediabunny';

/** Length of an audio or video file in seconds, read from its metadata (decoded if it has none). */
export async function mediaDuration(url: string): Promise<number> {
  const input = new Input({ formats: ALL_FORMATS, source: new UrlSource(url) });
  try {
    return (await input.getDurationFromMetadata()) ?? (await input.computeDuration());
  } finally {
    input.dispose();
  }
}

/** Length of a local audio file, after confirming that the container has an audio track. */
export async function audioDuration(file: string): Promise<number> {
  const input = new Input({ formats: ALL_FORMATS, source: new FilePathSource(file) });
  try {
    const audio = await input.getPrimaryAudioTrack();
    if (!audio) throw new Error('Input has no audio track.');
    return (await audio.getDurationFromMetadata()) ?? (await audio.computeDuration());
  } finally {
    input.dispose();
  }
}
