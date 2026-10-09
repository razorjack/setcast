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
