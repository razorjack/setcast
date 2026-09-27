import type { Theme } from '@setcast/core';
import { packaged } from './packaged.ts';

export const bristol: Theme = {
  name: 'bristol',
  description: 'A flat grey field, a white contour and the set told in stacked green stripes.',
  cssFile: packaged('bristol/theme.css'),
  modulation: [],
  visualizer: [
    { name: 'radial', style: 'line', bars: 24, radius: 0.24, length: 0.22, spin: 1, gain: 0.9 },
    { name: 'spectrum', style: 'line', bars: 40, gain: 0.9, floor: 0.04 },
  ],
};
