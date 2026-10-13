import type { Theme } from '@setcast/core';
import { packaged } from './packaged.ts';

export const escapement: Theme = {
  name: 'escapement',
  description:
    'White paper and a diagonal band of cyan glass over your art, centered on its subject; pixel capitals and a clock ticking on the beat.',
  cssFile: packaged('escapement/theme.css'),
  modulation: [
    { source: 'bass', target: 'band', range: [1, 1.16], curve: 'pow2', smooth: 0.1, when: 'drop' },
    { source: 'rms', target: 'streak', range: [0.2, 1], curve: 'linear', smooth: 0.3 },
    { source: 'bass', target: 'bg-zoom', range: [1, 1.03], curve: 'pow2', smooth: 0.08 },
  ],
  visualizer: { name: 'radial', bars: 25, radius: 0.34, length: 0.12, spin: 6 },
  tracklist: { before: 2, after: 2 },
};
