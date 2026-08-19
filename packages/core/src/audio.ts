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

export const SILENCE: AudioFeatures = Object.freeze({
  bass: 0,
  mids: 0,
  highs: 0,
  rms: 0,
  onset: 0,
  bins: Object.freeze(new Array<number>(64).fill(0)),
});

export const silentAnalyzer: AudioAnalyzer = { featuresAt: () => SILENCE };
