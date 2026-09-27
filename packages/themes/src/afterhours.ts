import type { Theme } from '@setcast/core';
import { packaged } from './packaged.ts';

export const afterhours: Theme = {
  name: 'afterhours',
  description:
    'Warm, late and soft: amber and rose light, an italic serif, and the frame ducking with the kick.',
  cssFile: packaged('afterhours/theme.css'),
  modulation: [
    { source: 'bass', target: 'pump', range: [0, 1], curve: 'pow2', smooth: 0.04 },
    { source: 'rms', target: 'warmth', range: [0.3, 1], curve: 'linear', smooth: 0.8 },
    { source: 'bass', target: 'bg-zoom', range: [1, 1.018], curve: 'pow2', smooth: 0.05 },
  ],
  visualizer: { name: 'spectrum', style: 'line', bars: 48, gain: 0.9, floor: 0.03 },
};
