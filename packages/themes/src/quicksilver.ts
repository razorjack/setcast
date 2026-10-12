import type { Theme } from '@setcast/core';
import { packaged } from './packaged.ts';

export const quicksilver: Theme = {
  name: 'quicksilver',
  description:
    'Your art in a cobalt glass orb, set in a chrome spindle that mirrors its colors, with spaced chrome capitals on bright silver.',
  cssFile: packaged('quicksilver/theme.css'),
  modulation: [
    { source: 'bass', target: 'orb', range: [0, 1], curve: 'pow2', smooth: 0.08 },
    { source: 'rms', target: 'shine', range: [0, 1], curve: 'linear', smooth: 0.6 },
  ],
  visualizer: [
    { name: 'bloom', bands: ['bass', 'highs'], gain: 1.1 },
    { name: 'radial', bars: 48, radius: 0.3, length: 0.12, spin: 0, gain: 0.9 },
  ],
};
