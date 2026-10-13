import type { Theme } from '@setcast/core';
import { packaged } from './packaged.ts';

export const anamorphic: Theme = {
  name: 'anamorphic',
  description:
    'The set as a film: your art in a 2.39:1 band, the credits in the bars, the frame opening on every drop.',
  cssFile: packaged('anamorphic/theme.css'),
  modulation: [],
  visualizer: [
    { name: 'bloom', bands: ['bass', 'highs'], gain: 1.1 },
    { name: 'spectrum', style: 'line', bars: 24, gain: 0.8, floor: 0 },
  ],
  tracklist: { before: 2, after: 2 },
};
