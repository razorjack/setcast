import type { SetEnvelope } from './analysis.ts';
import type { SetEvent } from './events.ts';
import type { ModRoute } from './modulation.ts';
import type { VisualizerConfig } from './visualizers.ts';

/**
 * Everything a renderer needs, fully resolved and JSON-serializable. Paths are relative to the
 * project directory, which the renderer serves as its public root.
 */
export type ResolvedProject = {
  title: string;
  /** Seconds added to the displayed clock and its endpoint, without shifting the timeline. */
  clockOffset: number;
  /** Displayed total duration, or null to use the offset plus audio duration. */
  clockTotal: number | null;
  /** Display-only track numbering offset; timeline indices remain zero-based. */
  trackNumberOffset: number;
  audio: string;
  background: string | null;
  theme: string;
  /** Base CSS + theme CSS (fonts inlined) + user CSS, in that order. */
  css: string;
  width: number;
  height: number;
  fps: number;
  /** Tracks merged in as `track_start` events, sorted by time. */
  events: SetEvent[];
  /** Theme defaults followed by the project's own routes. */
  modulation: ModRoute[];
  /** The `visualizer:` entries in drawing order, each after its own schema filled in the defaults. */
  visualizers: VisualizerConfig[];
  /**
   * The whole set's energy, when a visualizer draws it (`drawsWholeSet`). Loading a project leaves
   * it null; commands that render read the audio and fill it in.
   */
  envelope: SetEnvelope | null;
  /** How long the now-playing panel stays up after a track change, and how long it takes to leave. */
  panel: { dwell: number; fade: number };
  /** Tempo, or null when the project does not state one. */
  bpm: number | null;
  /** Seconds into the audio of a downbeat. */
  beatOffset: number;
};
