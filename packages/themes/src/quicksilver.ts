import type { Theme } from '@setcast/core';
import { packaged } from './packaged.ts';

/** A bright silver field, a chrome spindle around a cobalt orb, spaced chrome capitals. */
export const quicksilver: Theme = {
  name: 'quicksilver',
  cssFile: packaged('quicksilver/theme.css'),
  modulation: [
    { source: 'bass', target: 'orb', range: [0, 1], curve: 'pow2', smooth: 0.08 },
    { source: 'rms', target: 'shine', range: [0, 1], curve: 'linear', smooth: 0.6 },
  ],
  visualizer: { name: 'radial', bars: 36, radius: 0.3, length: 0.17, spin: 0, gain: 0.9 },
};
