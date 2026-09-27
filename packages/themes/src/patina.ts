import type { Theme } from '@setcast/core';
import { packaged } from './packaged.ts';

/** A worn print in a dark frame, small tracked capitals, and the waveform as one vibrating string. */
export const patina: Theme = {
  name: 'patina',
  cssFile: packaged('patina/theme.css'),
  modulation: [
    { source: 'rms', target: 'exposure', range: [0.8, 1.15], curve: 'linear', smooth: 0.4 },
    { source: 'bass', target: 'string', range: [0, 1], curve: 'sqrt', smooth: 0.06 },
  ],
  visualizer: { name: 'oscilloscope', gain: 0.7, trail: 4 },
};
