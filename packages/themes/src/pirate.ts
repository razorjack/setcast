import type { Theme } from '@setcast/core';
import { packaged } from './packaged.ts';

export const pirate: Theme = {
  name: 'pirate',
  description:
    'A photocopied rave flyer: a worn grey copy on paper, toner dust, one fluoro spot color.',
  cssFile: packaged('pirate/theme.css'),
  modulation: [],
  visualizer: { name: 'spectrum', bars: 40, gap: 0.3, gain: 1 },
};
