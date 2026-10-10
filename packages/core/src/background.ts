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
  /** Mean detail of the grid cells: about 0.005 for flat art, 0.1 for busy art. */
  detail: number;
  /** Up to two prominent hues as `rgb()` colors, most prominent first; none for grey art. */
  colors: string[];
  /** Where the subject sits, in fractions of the frame: the center of the art's busiest cells. */
  focus: FramePoint;
  /** The candidate text area with the least detail. */
  calm: CalmArea;
  grid: ArtGrid;
}

/** A downscaled copy of the art as the frame shows it, one value per pixel, row by row. */
export interface ArtGrid extends Size {
  /** Rec. 709 luma, 0..1. */
  luma: number[];
  /** The mean absolute luma difference from the neighboring cells, 0..1. */
  detail: number[];
}

/** A point in fractions of the frame's width and height, from its top left corner. */
export interface FramePoint {
  x: number;
  y: number;
}

/** Where a block of text sits in the frame, named after the edges it keeps to. */
export type CalmAnchor =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

export interface CalmArea {
  anchor: CalmAnchor;
  /** Mean luma of the art in the area. */
  luma: number;
  /** Mean detail of the art in the area. */
  detail: number;
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

const HUE_BINS = 24;
/** Pixels greyer than this have no hue worth taking. */
const MIN_CHROMA = 0.1;
/** A hue counts once it weighs this share of the pixels, at full saturation. */
const MIN_HUE_SHARE = 0.002;
/** The second color sits at least this many bins (60°) from the first. */
const MIN_HUE_DISTANCE = 4;

interface HueBin {
  weight: number;
  red: number;
  green: number;
  blue: number;
}

/** Reads RGBA pixels, as `getImageData` returns them, of a downscaled copy of the art. */
export function measureBackground(rgba: ArrayLike<number>, size: Size): BackgroundStats {
  const pixels = size.width * size.height;
  const bins: HueBin[] = Array.from({ length: HUE_BINS }, () => ({
    weight: 0,
    red: 0,
    green: 0,
    blue: 0,
  }));
  const luma: number[] = [];
  for (let pixel = 0; pixel < pixels; pixel++) {
    const red = rgba[pixel * 4]! / 255;
    const green = rgba[pixel * 4 + 1]! / 255;
    const blue = rgba[pixel * 4 + 2]! / 255;
    luma.push(0.2126 * red + 0.7152 * green + 0.0722 * blue);
    addToHueBin(bins, red, green, blue);
  }
  const grid = { ...size, luma, detail: detailOf(luma, size) };
  const detail = mean(grid.detail);
  return {
    luma: mean(luma),
    detail,
    colors: prominentColors(bins, pixels),
    focus: focusOf(grid, detail),
    calm: calmestArea(grid),
    grid,
  };
}

const mean = (values: number[]) =>
  values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

/** How much each cell differs from the cells beside, above and below it. */
function detailOf(luma: number[], { width, height }: Size): number[] {
  return luma.map((cell, index) => {
    const column = index % width;
    const row = Math.floor(index / width);
    const neighbors: number[] = [];
    if (column > 0) neighbors.push(luma[index - 1]!);
    if (column < width - 1) neighbors.push(luma[index + 1]!);
    if (row > 0) neighbors.push(luma[index - width]!);
    if (row < height - 1) neighbors.push(luma[index + width]!);
    return mean(neighbors.map((neighbor) => Math.abs(neighbor - cell)));
  });
}

/** The center of the cells busier than the mean, each weighted by how much busier it is. */
function focusOf(grid: ArtGrid, meanDetail: number): FramePoint {
  let x = 0;
  let y = 0;
  let weight = 0;
  for (const [index, detail] of grid.detail.entries()) {
    const excess = detail - meanDetail;
    if (excess <= 0) continue;
    x += ((index % grid.width) + 0.5) * excess;
    y += (Math.floor(index / grid.width) + 0.5) * excess;
    weight += excess;
  }
  if (weight === 0) return { x: 0.5, y: 0.5 };
  return { x: x / weight / grid.width, y: y / weight / grid.height };
}

/**
 * Where a title block could sit in a landscape frame: the corners and the middle of each edge,
 * each about a third of the frame. The order breaks ties, bottom left first.
 */
const LANDSCAPE_AREAS: [CalmAnchor, FrameArea][] = [
  ['bottom-left', { left: 0, top: 0.66, right: 0.42, bottom: 1 }],
  ['bottom-right', { left: 0.58, top: 0.66, right: 1, bottom: 1 }],
  ['top-left', { left: 0, top: 0, right: 0.42, bottom: 0.34 }],
  ['top-right', { left: 0.58, top: 0, right: 1, bottom: 0.34 }],
  ['left', { left: 0, top: 0.33, right: 0.42, bottom: 0.67 }],
  ['right', { left: 0.58, top: 0.33, right: 1, bottom: 0.67 }],
  ['bottom', { left: 0.29, top: 0.66, right: 0.71, bottom: 1 }],
  ['top', { left: 0.29, top: 0, right: 0.71, bottom: 0.34 }],
];

/** A portrait frame is too narrow for a block beside the subject, so it has bands across it. */
const PORTRAIT_AREAS: [CalmAnchor, FrameArea][] = [
  ['bottom', { left: 0, top: 0.7, right: 1, bottom: 1 }],
  ['top', { left: 0, top: 0, right: 1, bottom: 0.3 }],
];

function calmestArea(grid: ArtGrid): CalmArea {
  const areas = grid.width >= grid.height ? LANDSCAPE_AREAS : PORTRAIT_AREAS;
  const measured = areas.map(([anchor, area]) => ({
    anchor,
    ...(artBehind(grid, area) ?? { luma: 0, detail: 0 }),
  }));
  return measured.reduce((calmest, area) => (area.detail < calmest.detail ? area : calmest));
}

/** Saturated pixels weigh more, dark ones included, so a dark red scene still reads as red. */
function addToHueBin(bins: HueBin[], red: number, green: number, blue: number): void {
  const max = Math.max(red, green, blue);
  const chroma = max - Math.min(red, green, blue);
  if (chroma < MIN_CHROMA) return;
  const bin = bins[Math.floor((hue(red, green, blue) / 360) * HUE_BINS) % HUE_BINS]!;
  const weight = chroma * (chroma / max);
  bin.weight += weight;
  bin.red += red * weight;
  bin.green += green * weight;
  bin.blue += blue * weight;
}

/** HSV hue in degrees, 0..360, of a color that has some chroma. */
function hue(red: number, green: number, blue: number): number {
  const max = Math.max(red, green, blue);
  const chroma = max - Math.min(red, green, blue);
  if (max === red) return (((green - blue) / chroma + 6) % 6) * 60;
  if (max === green) return ((blue - red) / chroma + 2) * 60;
  return ((red - green) / chroma + 4) * 60;
}

/** The heaviest hue, and the heaviest one at least 60° from it; each bin counts half its neighbors. */
function prominentColors(bins: HueBin[], pixels: number): string[] {
  const score = (index: number) =>
    bins[index]!.weight +
    0.5 * (bins[wrapBin(index - 1)]!.weight + bins[wrapBin(index + 1)]!.weight);
  const ranked = bins
    .map((_, index) => index)
    .filter((index) => score(index) >= MIN_HUE_SHARE * pixels)
    .toSorted((left, right) => score(right) - score(left));
  const first = ranked[0];
  if (first === undefined) return [];
  const second = ranked.find((index) => hueDistance(index, first) >= MIN_HUE_DISTANCE);
  const chosen = second === undefined ? [first] : [first, second];
  return chosen.map((index) => binColor(bins, index));
}

const wrapBin = (index: number) => (index + HUE_BINS) % HUE_BINS;

const hueDistance = (left: number, right: number) =>
  Math.min(Math.abs(left - right), HUE_BINS - Math.abs(left - right));

/** The weighted mean color of a bin and its neighbors. */
function binColor(bins: HueBin[], index: number): string {
  const neighbors = [wrapBin(index - 1), index, wrapBin(index + 1)].map((bin) => bins[bin]!);
  const weight = neighbors.reduce((total, bin) => total + bin.weight, 0);
  const channel = (pick: (bin: HueBin) => number) =>
    Math.round((neighbors.reduce((total, bin) => total + pick(bin), 0) / weight) * 255);
  return `rgb(${channel((bin) => bin.red)} ${channel((bin) => bin.green)} ${channel((bin) => bin.blue)})`;
}

/** An image as the stage knows it: its own shape and what the frame shows of it. */
export interface MeasuredArt {
  /** The image's width over its height. */
  aspect: number;
  stats: BackgroundStats;
}

/** Nothing for a video or a stage without art, so themes fall back to `var(--bg-exposure, 1)`. */
export function backgroundVars(art: MeasuredArt | null): Record<string, string> {
  if (!art) return {};
  const { stats } = art;
  const exposure = clamp(REFERENCE_LUMA / stats.luma, ...EXPOSURE_LIMITS);
  const vars: Record<string, string> = {
    '--bg-aspect': art.aspect.toFixed(4),
    '--bg-luma': stats.luma.toFixed(3),
    '--bg-exposure': exposure.toFixed(3),
    '--bg-detail': stats.detail.toFixed(3),
    '--bg-focus-x': stats.focus.x.toFixed(3),
    '--bg-focus-y': stats.focus.y.toFixed(3),
    '--bg-calm-luma': stats.calm.luma.toFixed(3),
    '--bg-calm-detail': stats.calm.detail.toFixed(3),
  };
  for (const [index, color] of stats.colors.entries()) vars[`--bg-color-${index + 1}`] = color;
  return vars;
}

/** A part of the frame in fractions of its width and height, from its top left corner. */
export interface FrameArea {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The art under an element: its mean luma and mean detail. */
export interface ArtBehind {
  luma: number;
  detail: number;
}

/**
 * Mean luma and detail of the art under `area`, each cell weighted by how much of it the area
 * covers, so the values change smoothly as an element moves. Null when the area covers none of
 * the frame.
 */
export function artBehind(grid: ArtGrid, area: FrameArea): ArtBehind | null {
  const left = clamp(area.left, 0, 1) * grid.width;
  const right = clamp(area.right, 0, 1) * grid.width;
  const top = clamp(area.top, 0, 1) * grid.height;
  const bottom = clamp(area.bottom, 0, 1) * grid.height;
  let lumaSum = 0;
  let detailSum = 0;
  let coverage = 0;
  for (let row = Math.floor(top); row < Math.ceil(bottom); row++) {
    const rowCoverage = Math.min(row + 1, bottom) - Math.max(row, top);
    for (let column = Math.floor(left); column < Math.ceil(right); column++) {
      const cellCoverage = rowCoverage * (Math.min(column + 1, right) - Math.max(column, left));
      const cell = row * grid.width + column;
      lumaSum += grid.luma[cell]! * cellCoverage;
      detailSum += grid.detail[cell]! * cellCoverage;
      coverage += cellCoverage;
    }
  }
  if (coverage === 0) return null;
  return { luma: lumaSum / coverage, detail: detailSum / coverage };
}
