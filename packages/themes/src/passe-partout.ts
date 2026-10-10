import type { Theme } from '@setcast/core';
import { packaged } from './packaged.ts';

export const passePartout: Theme = {
  name: 'passe-partout',
  description:
    'Your art as a framed print, untouched, on a wall in its own colors, with a museum label beside it.',
  cssFile: packaged('passe-partout/theme.css'),
  modulation: [{ source: 'rms', target: 'spot', range: [0, 1], curve: 'linear', smooth: 0.8 }],
  visualizer: { name: 'spectrum', fill: 'art', bars: 40, gap: 0.42, gain: 0.85, floor: 0 },
};
