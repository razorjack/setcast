import { OutputSchema } from './config.ts';
import { SetcastError } from './errors.ts';

/** Inclusive absolute frame indices, after range validation. */
export type FrameRange = [number, number];

export function resolveFrameRange(
  [start, end]: [number, number],
  fps: number,
  totalFrames: number,
): [number, number] {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
    throw new SetcastError(
      `Invalid render range: ${start}-${end}`,
      'START and END must be finite non-negative seconds, and END must be after START.',
    );
  }
  const first = Math.round(start * fps);
  if (first >= totalFrames) {
    throw new SetcastError(
      `Render range starts at ${start} s, after the composition ends at ${totalFrames / fps} s`,
      'Choose a range that starts before the end of the audio.',
    );
  }
  const last = Math.max(first, Math.min(totalFrames - 1, Math.round(end * fps) - 1));
  return [first, last];
}

export function resolveChunkSeconds(chunkSeconds: number | undefined): number {
  const parsed = OutputSchema.safeParse({ chunkSeconds });
  if (!parsed.success) {
    throw new SetcastError(
      `Invalid render chunkSeconds: ${chunkSeconds}`,
      parsed.error.issues.map((issue) => issue.message).join(' '),
      { cause: parsed.error },
    );
  }
  return parsed.data.chunkSeconds;
}

/** Inclusive absolute ranges; only the final chunk may be shorter than the chosen size. */
export function splitFrameRange(range: FrameRange, framesPerChunk: number): FrameRange[] {
  if (framesPerChunk === 0) return [range];
  const ranges: FrameRange[] = [];
  for (let start = range[0]; start <= range[1]; start += framesPerChunk) {
    ranges.push([start, Math.min(range[1], start + framesPerChunk - 1)]);
  }
  return ranges;
}
