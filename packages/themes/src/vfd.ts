import type { Theme } from '@setcast/core';
import { packaged } from './packaged.ts';

export const vfd: Theme = {
  name: 'vfd',
  description:
    'The blue-green vacuum fluorescent display of a 90s deck in front of your art: dot matrix, level meters, peak hold.',
  cssFile: packaged('vfd/theme.css'),
  modulation: [{ source: 'rms', target: 'glow', range: [0.6, 1.1], curve: 'linear', smooth: 0.2 }],
  visualizer: [
    { name: 'bloom', bands: ['bass', 'highs'], gain: 0.9 },
    { name: 'meters', bands: ['bass', 'highs'], segments: 32, peak: 1.2, gain: 1 },
  ],
};
