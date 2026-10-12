import type { Theme } from '@setcast/core';
import { packaged } from './packaged.ts';

export const patina: Theme = {
  name: 'patina',
  description:
    'A worn, hand-tinted print of your art in a dark frame, small tracked capitals, and one string under it vibrating with the bass.',
  cssFile: packaged('patina/theme.css'),
  modulation: [
    { source: 'rms', target: 'exposure', range: [0.8, 1.15], curve: 'linear', smooth: 0.4 },
    { source: 'bass', target: 'string', range: [0, 1], curve: 'sqrt', smooth: 0.06 },
  ],
  visualizer: { name: 'oscilloscope', gain: 1.8, trail: 6 },
};
