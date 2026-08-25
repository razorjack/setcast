import type { Pcm } from './audio.ts';
import type { SetEvent } from './events.ts';
import { clamp } from './motion.ts';

/** Seconds between analysis frames: ~86 per second, fine enough to hold a beat grid. */
export const HOP_SECONDS = 0.0116;

/** How the set's energy moves over time, one value per hop. */
export interface Envelope {
  /** Seconds between values. */
  hop: number;
  /** Bass energy (below ~150 Hz), scaled so the loudest stretch of the set is 1. */
  bass: number[];
  /** Everything above the bass, same scale. */
  high: number[];
}

/**
 * Splits `pcm` into a bass and a high envelope. Two cascaded one-pole filters at 150 Hz do the
 * splitting: bass is what they keep, high is what they drop. Enough for section and beat
 * detection, and it needs no FFT.
 */
export function envelope({ samples, sampleRate }: Pcm, hopSeconds = HOP_SECONDS): Envelope {
  const hop = Math.max(1, Math.round(hopSeconds * sampleRate));
  const count = Math.floor(samples.length / hop);
  const bass = new Array<number>(count);
  const high = new Array<number>(count);
  const a = 1 - Math.exp((-2 * Math.PI * 150) / sampleRate);
  let low1 = 0;
  let low2 = 0;
  for (let k = 0; k < count; k++) {
    let lowSum = 0;
    let highSum = 0;
    for (let i = k * hop; i < (k + 1) * hop; i++) {
      const x = samples[i]!;
      low1 += a * (x - low1);
      low2 += a * (low1 - low2);
      lowSum += low2 * low2;
      highSum += (x - low2) * (x - low2);
    }
    bass[k] = Math.sqrt(lowSum / hop);
    high[k] = Math.sqrt(highSum / hop);
  }
  return { hop: hop / sampleRate, bass: normalize(bass), high: normalize(high) };
}

/** Tempi outside this are either a different art form or an octave error. */
export const BPM_RANGE: readonly [number, number] = [85, 185];

/**
 * Tempo, from the autocorrelation of the onset flux over several windows reduced to their median,
 * so one odd passage cannot move it. Null when nothing periodic stands out.
 */
export function estimateBpm(env: Envelope, [min, max]: readonly [number, number] = BPM_RANGE) {
  const flux = onsetFlux(env);
  const lagMin = Math.max(2, Math.round(60 / max / env.hop));
  const lagMax = Math.round(60 / min / env.hop);
  const span = Math.min(flux.length, Math.round(20 / env.hop));
  if (span <= lagMax * 2) return null;
  const found = windowStarts(flux.length, span, 8)
    .map((start) => windowBpm(flux, start, span, lagMin, lagMax, env.hop))
    .filter((bpm): bpm is number => bpm !== null);
  return found.length ? median(found) : null;
}

export interface SectionOptions {
  /** 0..1; higher splits the set into more sections. */
  sensitivity?: number;
  /** A stretch shorter than this is folded into the one before it. */
  minSeconds?: number;
}

/**
 * Reads the set as loud-bass and quiet-bass stretches and returns a `drop` where the bass comes
 * in and a `breakdown` where it drops out. A drop's `intensity` is the mean bass of its stretch.
 * Buildups are musical intent rather than energy, so they stay the user's to place.
 */
export function detectSections(
  env: Envelope,
  { sensitivity = 0.5, minSeconds = 8 }: SectionOptions = {},
): SetEvent[] {
  const bass = movingAverage(env.bass, Math.round(1 / env.hop));
  const high = 0.75 - 0.4 * clamp(sensitivity, 0, 1);
  const runs = segment(bass, high, high - 0.2, Math.round(minSeconds / env.hop));
  return runs.slice(1).map((run) => {
    const time = round(run.start * env.hop);
    if (!run.loud) return { type: 'breakdown', time };
    return { type: 'drop', time, intensity: round(clamp(mean(bass, run.start, run.end), 0, 1)) };
  });
}

interface Run {
  start: number;
  end: number;
  loud: boolean;
}

/** Two-state split with hysteresis, so a single quiet bar inside a drop is not a breakdown. */
function segment(values: number[], high: number, low: number, minLength: number): Run[] {
  const runs: Run[] = [];
  let loud = (values[0] ?? 0) >= high;
  let start = 0;
  for (let i = 1; i < values.length; i++) {
    if (loud ? values[i]! > low : values[i]! < high) continue;
    runs.push({ start, end: i, loud });
    loud = !loud;
    start = i;
  }
  runs.push({ start, end: values.length, loud });
  return fold(runs, minLength);
}

/** Folds runs shorter than `minLength` into the one before them and joins equal neighbours. */
function fold(runs: Run[], minLength: number): Run[] {
  const out: Run[] = [];
  for (const run of runs) {
    const prev = out.at(-1);
    if (prev && (run.end - run.start < minLength || prev.loud === run.loud)) prev.end = run.end;
    else out.push({ ...run });
  }
  return out;
}

/** How much louder each hop is than the one before it, across both bands. */
function onsetFlux({ bass, high }: Envelope): number[] {
  return bass.map((_, i) =>
    i === 0 ? 0 : Math.max(0, bass[i]! - bass[i - 1]!) + Math.max(0, high[i]! - high[i - 1]!),
  );
}

function windowBpm(
  flux: number[],
  start: number,
  span: number,
  lagMin: number,
  lagMax: number,
  hop: number,
): number | null {
  const end = Math.min(flux.length, start + span);
  const avg = mean(flux, start, end);
  const corr = (lag: number) => {
    let sum = 0;
    for (let i = start; i + lag < end; i++) sum += (flux[i]! - avg) * (flux[i + lag]! - avg);
    return sum / (end - start - lag);
  };

  let bestLag = 0;
  let best = 0;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    const c = corr(lag);
    if (c > best) {
      best = c;
      bestLag = lag;
    }
  }
  if (!bestLag) return null;

  // A steady beat also correlates at every multiple of its period; prefer the fastest lag that
  // still correlates nearly as well, or a 174 BPM roller reads as 87.
  let half = Math.round(bestLag / 2);
  while (half >= lagMin) {
    const c = corr(half);
    if (c < best * 0.8) break;
    bestLag = half;
    best = c;
    half = Math.round(bestLag / 2);
  }

  // One hop is 0.4% of a drum & bass bar, so read the period off its fourth multiple, where a hop
  // is a quarter as much of it, and divide back down.
  const over = bestLag * 5 < (end - start) / 2 ? 4 : 1;
  return 60 / ((refine(corr, bestLag * over, over) / over) * hop);
}

/** Peak position near `centre`, searched `radius` hops either way and interpolated between. */
function refine(corr: (lag: number) => number, centre: number, radius: number): number {
  let at = centre;
  let best = -Infinity;
  for (let lag = centre - radius; lag <= centre + radius; lag++) {
    const c = corr(lag);
    if (c > best) {
      best = c;
      at = lag;
    }
  }
  const curvature = corr(at - 1) - 2 * best + corr(at + 1);
  return curvature === 0
    ? at
    : at + clamp((0.5 * (corr(at - 1) - corr(at + 1))) / curvature, -1, 1);
}

/** Up to `count` evenly spaced window starts; fewer when the set is short. */
function windowStarts(length: number, span: number, count: number): number[] {
  const n = clamp(Math.floor(length / span), 1, count);
  if (n === 1) return [0];
  const step = (length - span) / (n - 1);
  return Array.from({ length: n }, (_, i) => Math.round(i * step));
}

/** Scales so the 95th percentile is 1: one peak cannot flatten the rest, unlike the maximum. */
function normalize(values: number[]): number[] {
  const sorted = values.toSorted((a, b) => a - b);
  const ref = sorted[Math.floor(0.95 * (sorted.length - 1))] || sorted.at(-1) || 0;
  return ref > 0 ? values.map((v) => v / ref) : values;
}

function movingAverage(values: number[], width: number): number[] {
  const half = Math.floor(width / 2);
  if (half < 1) return values;
  const sums = new Float64Array(values.length + 1);
  for (let i = 0; i < values.length; i++) sums[i + 1] = sums[i]! + values[i]!;
  return values.map((_, i) => {
    const from = Math.max(0, i - half);
    const to = Math.min(values.length, i + half + 1);
    return (sums[to]! - sums[from]!) / (to - from);
  });
}

function mean(values: number[], start: number, end: number): number {
  let sum = 0;
  for (let i = start; i < end; i++) sum += values[i]!;
  return end > start ? sum / (end - start) : 0;
}

const median = (values: number[]): number => {
  const sorted = values.toSorted((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

const round = (v: number) => Math.round(v * 100) / 100;
