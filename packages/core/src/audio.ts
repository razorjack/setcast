import { lerp } from './motion.ts';

/** Per-frame audio descriptors, normalized to 0..1 except the signed `wave`. */
export interface AudioFeatures {
  /** Sub and low bass energy (~20-150 Hz). */
  bass: number;
  /** Mid range (~150-2000 Hz): reese, snares, vocals. */
  mids: number;
  /** Highs (2 kHz+): hats, air. */
  highs: number;
  /** Overall loudness. */
  rms: number;
  /** Transient strength: how much louder now is than a moment ago. */
  onset: number;
  /** Log-spaced spectrum magnitudes from bass to highs, flattened against the 1/f tilt. */
  bins: readonly number[];
  /** The waveform of the last `WAVE_SECONDS`, for scopes. */
  wave: Wave;
}

/**
 * `WAVE_POINTS` samples per channel, -1..1, oldest first, each the mean of the audio it covers.
 * Mono audio has the same samples in both channels.
 */
export interface Wave {
  left: readonly number[];
  right: readonly number[];
}

export const FEATURE_SOURCES = ['bass', 'mids', 'highs', 'rms', 'onset'] as const;
export type FeatureSource = (typeof FEATURE_SOURCES)[number];

/** The seam: any source of audio features over time. Offline analysis and live capture both fit. */
export interface AudioAnalyzer {
  featuresAt(time: number): AudioFeatures;
}

/**
 * How far before the current frame a renderer guarantees `featuresAt`: it holds the frame until
 * that much audio has loaded, so a frame that looks back renders the same in every run.
 */
export const HISTORY_SECONDS = 8;

/**
 * `count` moments spread over the `seconds` up to `time`, oldest first. They sit on a fixed grid
 * of `seconds / count`, so the next frame shares every moment but the newest and a cached
 * analyzer measures only that one.
 */
export function historyTimes(time: number, seconds: number, count: number): number[] {
  if (seconds > HISTORY_SECONDS) {
    throw new RangeError(
      `historyTimes() asked for ${seconds} s of history; renderers keep ${HISTORY_SECONDS} s (HISTORY_SECONDS). Ask for less.`,
    );
  }
  const step = seconds / count;
  const newest = Math.floor(time / step);
  return Array.from({ length: count }, (_, index) => (newest - count + 1 + index) * step);
}

export const BIN_COUNT = 64;
/** Seconds of waveform in `AudioFeatures.wave`: one frame's worth at 30 fps. */
export const WAVE_SECONDS = 1 / 30;
export const WAVE_POINTS = 512;

const silentWave = Object.freeze(new Array<number>(WAVE_POINTS).fill(0));

export const SILENCE: AudioFeatures = Object.freeze({
  bass: 0,
  mids: 0,
  highs: 0,
  rms: 0,
  onset: 0,
  bins: Object.freeze(new Array<number>(BIN_COUNT).fill(0)),
  wave: Object.freeze({ left: silentWave, right: silentWave }),
});

export const silentAnalyzer: AudioAnalyzer = { featuresAt: () => SILENCE };

/** Decoded mono audio: one float per sample, nominally -1..1. */
export interface Pcm {
  samples: Float32Array;
  sampleRate: number;
}

/** A linear magnitude spectrum: `magnitudes[i]` covers frequency `i * sampleRate / 2 / length`. */
export interface Spectrum {
  magnitudes: ArrayLike<number>;
  sampleRate: number;
}

export const BANDS = {
  bass: [20, 150],
  mids: [150, 2000],
  highs: [2000, 16000],
} as const;

/** Mean magnitude between `fromHz` and `toHz`. */
export function bandEnergy(
  { magnitudes, sampleRate }: Spectrum,
  fromHz: number,
  toHz: number,
): number {
  const hzPerBin = sampleRate / 2 / magnitudes.length;
  const startBin = Math.max(0, Math.floor(fromHz / hzPerBin));
  const endBin = Math.min(magnitudes.length, Math.max(startBin + 1, Math.ceil(toHz / hzPerBin)));
  let sum = 0;
  for (let bin = startBin; bin < endBin; bin++) sum += magnitudes[bin]!;
  return sum / (endBin - startBin);
}

/** Soft limiter: 0 → 0, grows roughly linearly, approaches 1 asymptotically. */
export const soft = (level: number, gain = 1): number => 1 - Math.exp(-gain * Math.max(0, level));

export interface LogBinsOptions {
  count?: number;
  lo?: number;
  hi?: number;
  /** Exponent of the frequency-dependent boost that counteracts the 1/f tilt of music. */
  tilt?: number;
  gain?: number;
}

/**
 * Resamples a linear spectrum into `count` log-spaced bins between `lo` and `hi` Hz, boosts highs
 * by `(f / 100) ** tilt` so the picture is not all bass, and soft-limits to 0..1.
 */
export function logBins(
  spectrum: Spectrum,
  { count = BIN_COUNT, lo = 30, hi = 16000, tilt = 0.7, gain = 14 }: LogBinsOptions = {},
): number[] {
  const ratio = hi / lo;
  const bins = new Array<number>(count);
  for (let bin = 0; bin < count; bin++) {
    const startHz = lo * ratio ** (bin / count);
    const endHz = lo * ratio ** ((bin + 1) / count);
    const centreHz = Math.sqrt(startHz * endHz);
    bins[bin] = soft(bandEnergy(spectrum, startHz, endHz) * (centreHz / 100) ** tilt, gain);
  }
  return bins;
}

/**
 * Everything but `rms` and `onset`, which need the waveform and a second point in time.
 * Gains are calibrated against FFT magnitudes normalized by the full-scale int16 maximum
 * (what Remotion's `visualizeAudio` returns): a drum & bass drop lands around 0.8 bass.
 */
export function spectrumFeatures(
  spectrum: Spectrum,
): Pick<AudioFeatures, 'bass' | 'mids' | 'highs' | 'bins'> {
  return {
    bass: soft(bandEnergy(spectrum, ...BANDS.bass), 14),
    mids: soft(bandEnergy(spectrum, ...BANDS.mids), 60),
    highs: soft(bandEnergy(spectrum, ...BANDS.highs), 160),
    bins: logBins(spectrum),
  };
}

/** Root mean square of `samples`, soft-limited to 0..1. */
export function rms(samples: ArrayLike<number>, gain = 3): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i]!;
    sum += sample * sample;
  }
  return soft(Math.sqrt(sum / samples.length), gain);
}

/**
 * `points` values spanning `samples[start, end)`, each the mean of the samples it covers, so a
 * scope draws the waveform without hi-hats aliasing into noise. Indices outside `samples` are
 * silence.
 */
export function waveSlice(
  samples: ArrayLike<number>,
  start: number,
  end: number,
  points = WAVE_POINTS,
): number[] {
  const span = (end - start) / points;
  return Array.from({ length: points }, (_, point) => {
    const from = Math.round(start + point * span);
    const to = Math.max(from + 1, Math.round(start + (point + 1) * span));
    let sum = 0;
    for (let index = from; index < to; index++) sum += samples[index] ?? 0;
    return sum / (to - from);
  });
}

/** A bin as a bar height: scaled by `gain`, never under `floor` so silence keeps a baseline, capped at 1. */
export const level = (bin: number, gain: number, floor: number): number =>
  Math.max(floor, Math.min(1, bin * gain));

/** Seconds a held peak takes to fall from full scale to nothing once its hold is over. */
export const PEAK_FALL_SECONDS = 0.6;

/** Levels at an earlier moment, `age` seconds before the frame. */
export interface PastLevels {
  age: number;
  levels: readonly number[];
}

/**
 * The peak-hold marker of a hi-fi analyzer, one per level: the highest level of the last `hold`
 * seconds, falling at a steady rate once it is older than that.
 */
export function peakHold(
  current: readonly number[],
  past: readonly PastLevels[],
  hold: number,
): number[] {
  return current.map((level, index) => {
    let peak = level;
    for (const { age, levels } of past) {
      const fall = Math.max(0, age - hold) / PEAK_FALL_SECONDS;
      peak = Math.max(peak, levels[index]! - fall);
    }
    return peak;
  });
}

/** A level rounded up to whole cells out of `segments`, so a floor keeps the bottom cell lit. 0 leaves it as is. */
export const segmentedLevel = (level: number, segments: number): number =>
  segments === 0 ? level : Math.ceil(level * segments) / segments;

/**
 * Linear resample of `bins` to `count` points, first and last bin included. Visualizers draw a
 * fixed number of bars from a fixed number of bins; this is the one way they agree on.
 */
export function sampleBins(bins: readonly number[], count: number): number[] {
  if (bins.length === count) return [...bins];
  const lastBin = bins.length - 1;
  return Array.from({ length: count }, (_, index) => {
    const position = count > 1 ? (index / (count - 1)) * lastBin : 0;
    const before = Math.floor(position);
    const after = Math.min(lastBin, before + 1);
    return lerp(bins[before]!, bins[after]!, position - before);
  });
}
