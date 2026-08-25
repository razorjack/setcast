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
