import type { SetEvent } from './events.ts';
import type { ModRoute } from './modulation.ts';

/**
 * Everything a renderer needs, fully resolved and JSON-serializable. Paths are relative to the
 * project directory, which the renderer serves as its public root.
 */
export type ResolvedProject = {
  title: string;
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
  /** The `visualizer:` block after its own schema filled in the defaults. */
  visualizer: { name: string } & Record<string, unknown>;
};
