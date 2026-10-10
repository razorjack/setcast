import type { Theme } from '@setcast/core';
import { packaged } from './packaged.ts';

export const masthead: Theme = {
  name: 'masthead',
  description:
    'Your art full bleed and untouched, the track set into its emptiest part like a magazine cover line.',
  cssFile: packaged('masthead/theme.css'),
  modulation: [{ source: 'bass', target: 'rule', range: [0, 1], curve: 'pow2', smooth: 0.08 }],
  visualizer: { name: 'bloom', bands: ['bass', 'highs'], gain: 1.1 },
};
