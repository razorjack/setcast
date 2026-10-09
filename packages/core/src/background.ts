import { clamp } from './motion.ts';
import type { MixState } from './timeline.ts';

/**
 * Mean luma of the demo background, the dark backdrop every built-in theme is tuned against.
 * `--bg-exposure` scales any art to it, so a theme's treatment sees the brightness it expects.
 */
export const REFERENCE_LUMA = 0.09;
const EXPOSURE_LIMITS = [0.1, 4] as const;

export interface BackgroundStats {
  /** Mean Rec. 709 luma of the gamma-encoded pixels, 0..1. */
  luma: number;
}

/** The first focused play supplies its art; an empty focus uses the project background. */
export const currentBackground = (state: MixState, projectBackground: string | null) =>
  state.focusPlays[0]?.play.background ?? projectBackground;

export const isVideoFile = (path: string) => /\.(?:mp4|mov|webm|mkv|m4v)$/i.test(path);

export function backgroundKind(path: string | null): 'none' | 'image' | 'video' {
  if (!path) return 'none';
  return isVideoFile(path) ? 'video' : 'image';
}

export type BackgroundFit = 'auto' | 'cover' | 'contain';

export interface Size {
  width: number;
  height: number;
}

/** `auto` shows the whole art over a blurred copy once covering would cut away more than this. */
const AUTO_CONTAIN_CROP = 0.3;

/** The share of the art's width or height that covering the frame cuts away, 0..1. */
export function coverCrop(art: Size, frame: Size): number {
  const artAspect = art.width / art.height;
  const frameAspect = frame.width / frame.height;
  return 1 - Math.min(artAspect, frameAspect) / Math.max(artAspect, frameAspect);
}

export function resolveFit(fit: BackgroundFit, art: Size, frame: Size): 'cover' | 'contain' {
  if (fit !== 'auto') return fit;
  return coverCrop(art, frame) > AUTO_CONTAIN_CROP ? 'contain' : 'cover';
}

/** Above this, enlarged art looks soft. */
const SOFT_ENLARGEMENT = 1.5;

/**
 * What the user should know about one piece of art before rendering: that the frame enlarges it
 * enough to look soft, or that `auto` shows it whole because it has another shape. `label` says
 * where it is named, such as `background assets/bg.png`.
 */
export function backgroundWarnings(
  label: string,
  art: Size,
  frame: Size,
  fit: BackgroundFit,
): string[] {
  const shown = resolveFit(fit, art, frame);
  const scale = enlargement(art, frame, shown);
  const warnings: string[] = [];
  if (scale > SOFT_ENLARGEMENT) {
    warnings.push(
      `${label} is ${dimensions(art)}, so the ${dimensions(frame)} frame enlarges it ${scale.toFixed(1)}× and it will look soft. Use a version at least ${sharpSize(art, frame, shown)} if you have one.`,
    );
  }
  if (fit === 'auto' && shown === 'contain') {
    warnings.push(
      `${label} is ${dimensions(art)}, another shape than the ${dimensions(frame)} frame, so it is shown whole over a blurred copy of itself. Set backgroundFit: cover to crop it to the frame instead, or backgroundFit: contain to keep this without the note.`,
    );
  }
  return warnings;
}

const dimensions = (size: Size) => `${size.width}×${size.height}`;

/** The side that limits sharpness: the one the frame enlarges most (cover) or least (contain). */
function sharpSize(art: Size, frame: Size, fit: 'cover' | 'contain'): string {
  const widthLimits = frame.width / art.width >= frame.height / art.height;
  const byWidth = fit === 'cover' ? widthLimits : !widthLimits;
  return byWidth ? `${frame.width} px wide` : `${frame.height} px tall`;
}

/** How many times the frame enlarges the art when it shows it with `fit`. */
export function enlargement(art: Size, frame: Size, fit: 'cover' | 'contain'): number {
  const widthScale = frame.width / art.width;
  const heightScale = frame.height / art.height;
  return fit === 'cover' ? Math.max(widthScale, heightScale) : Math.min(widthScale, heightScale);
}

/** Reads RGBA pixels, as `getImageData` returns them, of a downscaled copy of the art. */
export function measureBackground(rgba: ArrayLike<number>): BackgroundStats {
  const pixels = Math.floor(rgba.length / 4);
  let lumaSum = 0;
  for (let pixel = 0; pixel < pixels; pixel++) {
    const offset = pixel * 4;
    lumaSum += 0.2126 * rgba[offset]! + 0.7152 * rgba[offset + 1]! + 0.0722 * rgba[offset + 2]!;
  }
  return { luma: pixels > 0 ? lumaSum / pixels / 255 : 0 };
}

/** Nothing for a video or a stage without art, so themes fall back to `var(--bg-exposure, 1)`. */
export function backgroundVars(stats: BackgroundStats | null): Record<string, string> {
  if (!stats) return {};
  const exposure = clamp(REFERENCE_LUMA / stats.luma, ...EXPOSURE_LIMITS);
  return {
    '--bg-luma': stats.luma.toFixed(3),
    '--bg-exposure': exposure.toFixed(3),
  };
}
