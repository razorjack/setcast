import type { Theme } from '@setcast/core';
import { packaged } from './packaged.ts';

export const interference: Theme = {
  name: 'interference',
  description:
    'Your art in its own colors on a corrupted signal: its channels split with the bass, and the picture tears on the drop.',
  cssFile: packaged('interference/theme.css'),
  modulation: [
    { source: 'bass', target: 'split', range: [0, 1], curve: 'pow2', smooth: 0.03 },
    { source: 'highs', target: 'noise', range: [0, 1], curve: 'linear', smooth: 0.05 },
    { source: 'onset', target: 'tear', range: [0, 1], curve: 'pow3', smooth: 0.02 },
  ],
  visualizer: { name: 'oscilloscope', gain: 0.9, trail: 3 },
};
