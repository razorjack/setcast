import type { Theme } from '@setcast/core';
import { packaged } from './packaged.ts';

/** A corrupted signal: the channels split with the bass, the picture tears on the drop. */
export const interference: Theme = {
  name: 'interference',
  cssFile: packaged('interference/theme.css'),
  modulation: [
    { source: 'bass', target: 'split', range: [0, 1], curve: 'pow2', smooth: 0.03 },
    { source: 'highs', target: 'noise', range: [0, 1], curve: 'linear', smooth: 0.05 },
    { source: 'onset', target: 'tear', range: [0, 1], curve: 'pow3', smooth: 0.02 },
  ],
  visualizer: [
    { name: 'spectrogram', seconds: 5, gain: 1.1 },
    { name: 'oscilloscope', gain: 0.9, trail: 3 },
  ],
};
