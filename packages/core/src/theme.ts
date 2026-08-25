import type { ModRouteInput } from './modulation.ts';

/** A theme is CSS plus a default modulation patch. Built-in and npm themes implement this. */
export interface Theme {
  name: string;
  /** Absolute path to the theme stylesheet. Relative `url()`s inside it are inlined at load. */
  cssFile: string;
  modulation: ModRouteInput[];
}
