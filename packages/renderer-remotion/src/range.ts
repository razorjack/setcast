import { SetcastError } from '@setcast/core';

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
