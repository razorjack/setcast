import type { Size } from './background.ts';
import { lumaOf, quantile } from './lights.ts';
import { clamp, lerp } from './motion.ts';

/**
 * The art as the frame shows it, for the ridgeline to raise and color its lines by: one height per
 * cell, 0..1, row by row, stretched so the art's darkest and brightest parts span the range, and
 * the cell's RGBA.
 */
export interface ReliefField extends Size {
  heights: Float32Array;
  rgba: ArrayLike<number>;
}

/** Share of the cells at each end that the stretch leaves out, so a few specks do not set it. */
const STRETCH_CLIP = 0.02;
/** The most the stretch scales by, so flat art stays flat instead of turning its noise into relief. */
const MIN_RANGE = 0.05;
/** The luma of a line in the art's colors over the art's darkest part, so the line stays visible. */
const INK_FLOOR = 0.3;
/** Grey added to every channel before brightening, so near-black brightens to grey, not noise. */
const BLACK_LIFT = 0.02;

/** Reads RGBA pixels, as `getImageData` returns them, of a downscaled copy of the art. */
export function reliefField(rgba: ArrayLike<number>, size: Size): ReliefField {
  const luma = lumaOf(rgba, size);
  const dark = quantile(luma, STRETCH_CLIP);
  const bright = quantile(luma, 1 - STRETCH_CLIP);
  const range = Math.max(MIN_RANGE, bright - dark);
  const heights = luma.map((value) => clamp((value - dark) / range, 0, 1));
  return { ...size, heights, rgba };
}

/** The field's height at a point in fractions of the frame, interpolated between cells. */
export function heightAt(field: ReliefField, x: number, y: number): number {
  return interpolated(field, x, y, (cell) => field.heights[cell]!);
}

/**
 * The art's color at a point in fractions of the frame, as bright as its height in the relief but
 * never darker than `INK_FLOOR`, so a line in the art's colors stays visible over dark art. Black
 * turns grey on the way, since it has no color to brighten.
 */
export function colorAt(field: ReliefField, x: number, y: number): string {
  const [red, green, blue] = [0, 1, 2].map(
    (channel) =>
      interpolated(field, x, y, (cell) => field.rgba[cell * 4 + channel]! / 255) + BLACK_LIFT,
  ) as [number, number, number];
  const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  const target = INK_FLOOR + (1 - INK_FLOOR) * heightAt(field, x, y);
  const channel = (value: number) => Math.round(Math.min(1, (value * target) / luma) * 255);
  return `rgb(${channel(red)} ${channel(green)} ${channel(blue)})`;
}

/** A value of the field at a point, interpolated between the four cells around it. */
function interpolated(
  { width, height }: Size,
  x: number,
  y: number,
  valueOf: (cell: number) => number,
): number {
  const column = clamp(x * width - 0.5, 0, width - 1);
  const row = clamp(y * height - 0.5, 0, height - 1);
  const left = Math.floor(column);
  const top = Math.floor(row);
  const right = Math.min(left + 1, width - 1);
  const bottom = Math.min(top + 1, height - 1);
  const upper = lerp(valueOf(top * width + left), valueOf(top * width + right), column - left);
  const lower = lerp(
    valueOf(bottom * width + left),
    valueOf(bottom * width + right),
    column - left,
  );
  return lerp(upper, lower, row - top);
}

/** Where the spectrum sits along a line, in fractions of its width. */
export interface SpectrumBand {
  /** Where the bass is. */
  center: number;
  /** How far the highs reach on either side of it. */
  reach: number;
}

/** The band `spread` wide around the subject at `focusX`, moved inside the line if it would leave it. */
export function spectrumBand(focusX: number, spread: number): SpectrumBand {
  const reach = spread / 2;
  return { center: clamp(focusX, reach, 1 - reach), reach };
}

/** From this share of the reach out, the spectrum tapers off, so it blends into the relief. */
const TAPER_FROM = 0.75;

/**
 * The spectrum's level at `x`: bass at the band's center, mirrored out to the highs at both ends
 * of its reach, where it tapers to 0; 0 outside the band.
 */
export function spectrumLift(levels: readonly number[], x: number, band: SpectrumBand): number {
  const distance = Math.abs(x - band.center) / band.reach;
  if (distance >= 1) return 0;
  const position = distance * (levels.length - 1);
  const below = Math.floor(position);
  const above = Math.min(below + 1, levels.length - 1);
  return lerp(levels[below]!, levels[above]!, position - below) * taper(distance);
}

function taper(distance: number): number {
  const inside = clamp((1 - distance) / (1 - TAPER_FROM), 0, 1);
  return inside * inside * (3 - 2 * inside);
}
