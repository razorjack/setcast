import type { SetEnvelope, SetTravel } from './analysis.ts';
import type { BackgroundFit } from './background.ts';
import type { MixDocument } from './mix-schema.ts';
import type { ModRoute } from './modulation.ts';
import type { TracklistCounts } from './tracklist.ts';
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
  audio: string;
  background: string | null;
  /** How art of another shape than the frame is shown; `auto` decides per image. */
  backgroundFit: BackgroundFit;
  theme: string;
  /** Base CSS + theme CSS (fonts inlined) + user CSS, in that order. */
  css: string;
  width: number;
  height: number;
  fps: number;
  mix: MixDocument;
  presentation: 'playlist' | 'dj';
  /** Theme defaults followed by the project's own routes. */
  modulation: ModRoute[];
  /** The `visualizer:` entries in drawing order, each after its own schema filled in the defaults. */
  visualizers: VisualizerConfig[];
  /**
   * The whole set's energy, when a visualizer draws it (`drawsWholeSet`). Loading a project leaves
   * it null; commands that render read the audio and fill it in.
   */
  envelope: SetEnvelope | null;
  /**
   * How far the music has carried the set, when the CSS reads `--travel-*` (`readsTravel`).
   * Loading a project leaves it null; commands that render read the audio and fill it in.
   */
  travel: SetTravel | null;
  /**
   * How long the now-playing panel stays up after a track change, and how long it takes to leave;
   * null when the project shows no panels.
   */
  panel: { dwell: number; fade: number } | null;
  /** How many listings the tracklist shows around the current one, or null when it is off. */
  tracklist: TracklistCounts | null;
  /** Tempo, or null when the project does not state one. */
  bpm: number | null;
  /** Seconds into the audio of a downbeat. */
  beatOffset: number;
};

/** An open-ended performance. A live session has no recorded file or finite mix document. */
export type ResolvedLiveProject = Omit<ResolvedProject, 'audio' | 'mix' | 'panel' | 'tracklist'> & {
  audio: null;
  mix: null;
  panel: null;
  tracklist: null;
  live: {
    clock: boolean;
    input: {
      device?: string;
      channels: [number, number] | null;
      gain: number;
      delay: number;
    };
  };
};

export type SceneProject = ResolvedProject | ResolvedLiveProject;
