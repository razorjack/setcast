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
  /** How much louder each hop is than the one before it, across both bands. */
  flux: number[];
}

/**
 * Splits `pcm` into a bass and a high envelope. Two cascaded one-pole filters at 150 Hz do the
 * splitting: bass is what they keep, high is what they drop. Enough for section and beat
 * detection, and it needs no FFT.
 */
export function envelope({ samples, sampleRate }: Pcm, hopSeconds = HOP_SECONDS): Envelope {
  const hop = Math.max(1, Math.round(hopSeconds * sampleRate));
  const hopCount = Math.floor(samples.length / hop);
  const bass = new Array<number>(hopCount);
  const high = new Array<number>(hopCount);

  // One pole per stage, so the two together roll off at 12 dB per octave from 150 Hz.
  const response = 1 - Math.exp((-2 * Math.PI * 150) / sampleRate);
  let firstStage = 0;
  let secondStage = 0;

  for (let hopIndex = 0; hopIndex < hopCount; hopIndex++) {
    let lowSum = 0;
    let highSum = 0;
    for (let i = hopIndex * hop; i < (hopIndex + 1) * hop; i++) {
      const sample = samples[i]!;
      firstStage += response * (sample - firstStage);
      secondStage += response * (firstStage - secondStage);
      const above = sample - secondStage;
      lowSum += secondStage * secondStage;
      highSum += above * above;
    }
    bass[hopIndex] = Math.sqrt(lowSum / hop);
    high[hopIndex] = Math.sqrt(highSum / hop);
  }

  const bassLevels = normalize(bass);
  const highLevels = normalize(high);
  return {
    hop: hop / sampleRate,
    bass: bassLevels,
    high: highLevels,
    flux: onsetFlux(bassLevels, highLevels),
  };
}

/** Tempi outside this are either a different art form or an octave error. */
export const BPM_RANGE: readonly [number, number] = [85, 185];

/**
 * Tempo, from the autocorrelation of the onset flux over several windows reduced to their median,
 * so one odd passage cannot move it. Null when nothing periodic stands out.
 */
export function estimateBpm(
  energy: Envelope,
  [slowest, fastest]: readonly [number, number] = BPM_RANGE,
) {
  const { flux, hop } = energy;
  const lagMin = Math.max(2, Math.round(60 / fastest / hop));
  const lagMax = Math.round(60 / slowest / hop);
  const span = Math.min(flux.length, Math.round(20 / hop));
  if (span <= lagMax * 2) return null;

  const perWindow = windowStarts(flux.length, span, 8)
    .map((start) => windowBpm({ flux, start, span, lagMin, lagMax, hop }))
    .filter((bpm): bpm is number => bpm !== null);
  return perWindow.length ? median(perWindow) : null;
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
  energy: Envelope,
  { sensitivity = 0.5, minSeconds = 8 }: SectionOptions = {},
): SetEvent[] {
  const bass = movingAverage(energy.bass, Math.round(1 / energy.hop));
  const loudAbove = 0.75 - 0.4 * clamp(sensitivity, 0, 1);
  const runs = segment(bass, loudAbove, loudAbove - 0.2, Math.round(minSeconds / energy.hop));

  // The first run is where the set already was, not a change; only what follows is an event.
  return runs.slice(1).map((run) => {
    const time = round(run.start * energy.hop);
    if (!run.loud) return { type: 'breakdown', time };
    return { type: 'drop', time, intensity: round(clamp(mean(bass, run.start, run.end), 0, 1)) };
  });
}

/**
 * The beat nearest to `time`, read off the onset flux in the `span` seconds around it: folded by
 * the beat period, the phase where the hits pile up is the grid. Local on purpose, so a tempo a
 * tenth of a BPM off does not drift the grid across an hour-long set.
 */
export function nearestBeat(energy: Envelope, bpm: number, time: number, span = 8): number {
  const { flux, hop } = energy;
  const period = 60 / bpm;
  const binCount = 24;
  const perBin = new Float64Array(binCount);

  const firstHop = Math.max(0, Math.round((time - span) / hop));
  const endHop = Math.min(flux.length, Math.round((time + span) / hop));
  for (let i = firstHop; i < endHop; i++) {
    const bin = Math.floor(wrap((i * hop - time) / period) * binCount) % binCount;
    perBin[bin] = perBin[bin]! + flux[i]!;
  }

  const loudestBin = perBin.indexOf(Math.max(...perBin));
  const ahead = ((loudestBin + 0.5) / binCount) * period;
  // The loudest phase is somewhere in the beat after `time`; behind is nearer past the halfway mark.
  return time + (ahead > period / 2 ? ahead - period : ahead);
}

/** Every drafted event moved onto its nearest beat. */
export const snapToBeats = (events: SetEvent[], energy: Envelope, bpm: number): SetEvent[] =>
  events.map((event) => ({ ...event, time: round(nearestBeat(energy, bpm, event.time)) }));

/** Seconds into the audio of the first beat: where CSS `--beat` should start from. */
export function beatOffset(energy: Envelope, bpm: number): number {
  const period = 60 / bpm;
  return round(wrap(nearestBeat(energy, bpm, 0) / period) * period);
}

/** Fractional part, positive even for a negative count. */
const wrap = (turns: number) => ((turns % 1) + 1) % 1;

interface Run {
  start: number;
  end: number;
  loud: boolean;
}

/** Two-state split with hysteresis, so a single quiet bar inside a drop is not a breakdown. */
function segment(
  values: number[],
  loudAbove: number,
  quietBelow: number,
  minLength: number,
): Run[] {
  const runs: Run[] = [];
  let loud = (values[0] ?? 0) >= loudAbove;
  let start = 0;

  for (let i = 1; i < values.length; i++) {
    const stateHolds = loud ? values[i]! > quietBelow : values[i]! < loudAbove;
    if (stateHolds) continue;
    runs.push({ start, end: i, loud });
    loud = !loud;
    start = i;
  }
  runs.push({ start, end: values.length, loud });

  return fold(runs, minLength);
}

/** Folds runs shorter than `minLength` into the one before them and joins equal neighbours. */
function fold(runs: Run[], minLength: number): Run[] {
  const folded: Run[] = [];
  for (const run of runs) {
    const previous = folded.at(-1);
    const merges = previous && (run.end - run.start < minLength || previous.loud === run.loud);
    if (merges) previous.end = run.end;
    else folded.push({ ...run });
  }
  return folded;
}

/** How much louder each hop is than the one before it, counting rises only, across both bands. */
function onsetFlux(bass: number[], high: number[]): number[] {
  return bass.map((_, index) => {
    if (index === 0) return 0;
    const bassRise = Math.max(0, bass[index]! - bass[index - 1]!);
    const highRise = Math.max(0, high[index]! - high[index - 1]!);
    return bassRise + highRise;
  });
}

interface BpmWindow {
  flux: number[];
  start: number;
  span: number;
  lagMin: number;
  lagMax: number;
  hop: number;
}

type Correlate = (lag: number) => number;

/** Tempo of one window, or null when the flux there has no periodic structure at all. */
function windowBpm({ flux, start, span, lagMin, lagMax, hop }: BpmWindow): number | null {
  const end = Math.min(flux.length, start + span);
  const average = mean(flux, start, end);
  const correlate: Correlate = (lag) => {
    let sum = 0;
    for (let i = start; i + lag < end; i++) {
      sum += (flux[i]! - average) * (flux[i + lag]! - average);
    }
    return sum / (end - start - lag);
  };

  const strongest = strongestLag(correlate, lagMin, lagMax);
  if (!strongest) return null;
  const beatLag = fastestEquivalentLag(correlate, strongest, lagMin);

  // One hop is 0.4% of a drum & bass bar, so read the period off its fourth multiple, where a hop
  // is a quarter as much of it, and divide back down.
  const multiple = beatLag * 5 < (end - start) / 2 ? 4 : 1;
  const period = refine(correlate, beatLag * multiple, multiple) / multiple;
  return 60 / (period * hop);
}

/** The lag the flux repeats at most strongly, or 0 when nothing correlates positively. */
function strongestLag(correlate: Correlate, lagMin: number, lagMax: number): number {
  let bestLag = 0;
  let best = 0;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    const correlation = correlate(lag);
    if (correlation > best) {
      best = correlation;
      bestLag = lag;
    }
  }
  return bestLag;
}

/**
 * A steady beat also correlates at every multiple of its period, so halve while the faster lag
 * still correlates nearly as well. Without this a 174 BPM roller reads as 87.
 */
function fastestEquivalentLag(correlate: Correlate, lag: number, lagMin: number): number {
  let bestLag = lag;
  let best = correlate(lag);
  for (let half = Math.round(lag / 2); half >= lagMin; half = Math.round(bestLag / 2)) {
    const correlation = correlate(half);
    if (correlation < best * 0.8) break;
    bestLag = half;
    best = correlation;
  }
  return bestLag;
}

/** Peak position near `centre`, searched `radius` lags either way and interpolated between. */
function refine(correlate: Correlate, centre: number, radius: number): number {
  let peakLag = centre;
  let peak = -Infinity;
  for (let lag = centre - radius; lag <= centre + radius; lag++) {
    const correlation = correlate(lag);
    if (correlation > peak) {
      peak = correlation;
      peakLag = lag;
    }
  }

  const before = correlate(peakLag - 1);
  const after = correlate(peakLag + 1);
  const curvature = before - 2 * peak + after;
  if (curvature === 0) return peakLag;
  return peakLag + clamp((0.5 * (before - after)) / curvature, -1, 1);
}

/** Up to `maxCount` evenly spaced window starts; fewer when the set is short. */
function windowStarts(length: number, span: number, maxCount: number): number[] {
  const count = clamp(Math.floor(length / span), 1, maxCount);
  if (count === 1) return [0];
  const step = (length - span) / (count - 1);
  return Array.from({ length: count }, (_, index) => Math.round(index * step));
}

/** Scales so the 95th percentile is 1: one peak cannot flatten the rest, unlike the maximum. */
function normalize(values: number[]): number[] {
  const sorted = values.toSorted((a, b) => a - b);
  const loud = sorted[Math.floor(0.95 * (sorted.length - 1))] || sorted.at(-1) || 0;
  if (loud <= 0) return values;
  return values.map((value) => value / loud);
}

function movingAverage(values: number[], width: number): number[] {
  const half = Math.floor(width / 2);
  if (half < 1) return values;

  const prefixSums = new Float64Array(values.length + 1);
  for (let i = 0; i < values.length; i++) prefixSums[i + 1] = prefixSums[i]! + values[i]!;

  return values.map((_, index) => {
    const from = Math.max(0, index - half);
    const to = Math.min(values.length, index + half + 1);
    return (prefixSums[to]! - prefixSums[from]!) / (to - from);
  });
}

function mean(values: number[], start: number, end: number): number {
  let sum = 0;
  for (let i = start; i < end; i++) sum += values[i]!;
  return end > start ? sum / (end - start) : 0;
}

const median = (values: number[]): number => {
  const sorted = values.toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

const round = (value: number) => Math.round(value * 100) / 100;
