import type { ModRouteInput } from './modulation.ts';
import type { VisualizerInput } from './visualizers.ts';

/** A theme is CSS plus a default modulation patch. Built-in and npm themes implement this. */
export interface Theme {
  name: string;
  /** Absolute path to the theme stylesheet. Relative `url()`s inside it are inlined at load. */
  cssFile: string;
  modulation: ModRouteInput[];
  /**
   * What the theme draws when `setcast.yaml` has no `visualizer:` key, written the same way: one
   * block or a list. Without it the project gets a spectrum.
   */
  visualizer?: VisualizerInput | VisualizerInput[];
}
