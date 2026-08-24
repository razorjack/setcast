/** Per-frame audio descriptors, all normalized to 0..1. */
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
}

export const FEATURE_SOURCES = ['bass', 'mids', 'highs', 'rms', 'onset'] as const;
export type FeatureSource = (typeof FEATURE_SOURCES)[number];

/** The seam: any source of audio features over time. Offline analysis and live capture both fit. */
export interface AudioAnalyzer {
  featuresAt(time: number): AudioFeatures;
}

export const BIN_COUNT = 64;

export const SILENCE: AudioFeatures = Object.freeze({
  bass: 0,
  mids: 0,
  highs: 0,
  rms: 0,
  onset: 0,
  bins: Object.freeze(new Array<number>(BIN_COUNT).fill(0)),
});

export const silentAnalyzer: AudioAnalyzer = { featuresAt: () => SILENCE };

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

/** Mean magnitude between `lo` and `hi` Hz. */
export function bandEnergy({ magnitudes, sampleRate }: Spectrum, lo: number, hi: number): number {
  const hz = sampleRate / 2 / magnitudes.length;
  const from = Math.max(0, Math.floor(lo / hz));
  const to = Math.min(magnitudes.length, Math.max(from + 1, Math.ceil(hi / hz)));
  let sum = 0;
  for (let i = from; i < to; i++) sum += magnitudes[i]!;
  return sum / (to - from);
}

/** Soft limiter: 0 → 0, grows roughly linearly, approaches 1 asymptotically. */
export const soft = (v: number, gain = 1): number => 1 - Math.exp(-gain * Math.max(0, v));

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
  for (let i = 0; i < count; i++) {
    const f0 = lo * ratio ** (i / count);
    const f1 = lo * ratio ** ((i + 1) / count);
    const fc = Math.sqrt(f0 * f1);
    bins[i] = soft(bandEnergy(spectrum, f0, f1) * (fc / 100) ** tilt, gain);
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
  for (let i = 0; i < samples.length; i++) sum += samples[i]! * samples[i]!;
  return soft(Math.sqrt(sum / samples.length), gain);
}

/**
 * Linear resample of `bins` to `count` points, first and last bin included. Visualizers draw a
 * fixed number of bars from a fixed number of bins; this is the one way they agree on.
 */
export function sampleBins(bins: readonly number[], count: number): number[] {
  if (bins.length === count) return [...bins];
  const last = bins.length - 1;
  return Array.from({ length: count }, (_, i) => {
    const pos = count > 1 ? (i / (count - 1)) * last : 0;
    const a = Math.floor(pos);
    const b = Math.min(last, a + 1);
    const t = pos - a;
    return bins[a]! * (1 - t) + bins[b]! * t;
  });
}
