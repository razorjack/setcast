import { SetcastError } from '../errors.ts';

/** The extension of a path or URL in lowercase with its dot (`art.PNG` → `.png`), or ''. */
export function fileExtension(path: string): string {
  return /\.[^./\\#?]+$/.exec(path)?.[0].toLowerCase() ?? '';
}

/** Backgrounds Setcast plays as looping video; any other background is shown as an image. */
export const VIDEO_EXTENSIONS: readonly string[] = ['.mp4', '.mov', '.webm', '.mkv', '.m4v'];

/** Images the player accepts as dropped artwork. Projects may name any image Chrome decodes. */
export const IMAGE_EXTENSIONS: readonly string[] = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];

export const isVideoFile = (path: string) => VIDEO_EXTENSIONS.includes(fileExtension(path));

/** Containers the exporters write H.264 video and AAC audio into. */
const VIDEO_OUTPUT_EXTENSIONS: readonly string[] = ['.mp4', '.mov', '.mkv'];

export type StillFormat = 'png' | 'jpeg' | 'webp';

const STILL_FORMATS: Record<string, StillFormat> = {
  '.png': 'png',
  '.jpg': 'jpeg',
  '.jpeg': 'jpeg',
  '.webp': 'webp',
};

export function requireVideoOutput(out: string): void {
  if (VIDEO_OUTPUT_EXTENSIONS.includes(fileExtension(out))) return;
  throw new SetcastError(
    `Cannot write video to ${out}`,
    'Use a .mp4, .mov or .mkv file name. Setcast renders H.264 video with AAC audio.',
  );
}

/** The image format a still is written in, chosen by the extension of `out`. */
export function requireStillFormat(out: string): StillFormat {
  const format = STILL_FORMATS[fileExtension(out)];
  if (format) return format;
  throw new SetcastError(
    `Cannot write a still to ${out}`,
    'Use a .png, .jpg or .webp file name for --out. Setcast picks the format from the extension.',
  );
}
