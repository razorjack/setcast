import type { Theme } from '@setcast/core';
import { packaged } from './packaged.ts';

export const vfd: Theme = {
  name: 'vfd',
  description:
    'The blue-green vacuum fluorescent display of a 90s deck: dot matrix, lamp cells, peak hold.',
  cssFile: packaged('vfd/theme.css'),
  modulation: [{ source: 'rms', target: 'glow', range: [0.6, 1.1], curve: 'linear', smooth: 0.2 }],
  visualizer: { name: 'spectrum', bars: 32, gap: 0.35, segments: 16, peak: 1.2, gain: 1 },
};
