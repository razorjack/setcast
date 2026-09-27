import type { Theme } from '@setcast/core';
import { packaged } from './packaged.ts';

export const pirate: Theme = {
  name: 'pirate',
  description:
    'A photocopied rave flyer: toner on paper, a halftone screen, one fluoro spot color.',
  cssFile: packaged('pirate/theme.css'),
  modulation: [],
  visualizer: { name: 'spectrum', bars: 40, gap: 0.3, gain: 1 },
};
