import type { Theme } from '@setcast/core';
import { packaged } from './packaged.ts';

/** A photocopied rave flyer: toner on paper, a halftone screen, one fluoro spot color. */
export const pirate: Theme = {
  name: 'pirate',
  cssFile: packaged('pirate/theme.css'),
  modulation: [],
  visualizer: { name: 'spectrum', bars: 40, gap: 0.3, gain: 1 },
};
