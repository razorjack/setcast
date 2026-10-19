import { microseconds } from './mix-schema.ts';

export function framesWithinMix(duration: number, fps: number): number {
  const frames = Math.max(1, Math.ceil((duration / 1_000_000) * fps));
  // A fractional frame time can round to the excluded microsecond at mix end.
  return microseconds((frames - 1) / fps) >= duration ? frames - 1 : frames;
}
