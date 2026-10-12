import type { Theme } from '@setcast/core';
import { packaged } from './packaged.ts';

export const bristol: Theme = {
  name: 'bristol',
  description:
    'Your art printed in green inks on a flat grey field, a white contour, and the set told in stacked green stripes.',
  cssFile: packaged('bristol/theme.css'),
  modulation: [],
  visualizer: [
    { name: 'spectrum', style: 'line', bars: 40, gain: 0.9, floor: 0.04 },
    { name: 'overview' },
  ],
};
