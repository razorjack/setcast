import type { ModRouteInput } from './modulation.ts';
import type { TracklistCountsInput } from './tracklist.ts';
import type { VisualizerInput } from './visualizers.ts';

/** A theme is CSS plus a default modulation patch. Built-in and npm themes implement this. */
export interface Theme {
  name: string;
  /** One line on how the theme looks, shown next to its name in `setcast init`. */
  description?: string;
  /** Absolute path to the theme stylesheet. Relative `url()`s inside it are inlined at load. */
  cssFile: string;
  modulation: ModRouteInput[];
  /**
   * What the theme draws when `setcast.yaml` has no `visualizer:` key, written the same way: one
   * block or a list. Without it the project gets a spectrum.
   */
  visualizer?: VisualizerInput | VisualizerInput[];
  /**
   * Shows the tracklist when `setcast.yaml` has no `tracklist:` key, with these counts. Without
   * it the tracklist is off unless the project turns it on.
   */
  tracklist?: TracklistCountsInput;
}
