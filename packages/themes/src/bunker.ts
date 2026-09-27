import type { Theme } from '@setcast/core';
import { packaged } from './packaged.ts';

/** Stencil on concrete, hazard tape running on the beat, and the room shaking on the drop. */
export const bunker: Theme = {
  name: 'bunker',
  cssFile: packaged('bunker/theme.css'),
  modulation: [
    { source: 'bass', target: 'shake', range: [0, 0.3], curve: 'pow3', smooth: 0.04, when: 'drop' },
    { source: 'onset', target: 'lamp', range: [0, 1], curve: 'pow2', smooth: 0.08 },
    {
      source: 'bass',
      target: 'bg-zoom',
      range: [1, 1.03],
      curve: 'pow2',
      smooth: 0.06,
      when: 'drop',
    },
  ],
  visualizer: { name: 'spectrum', bars: 24, segments: 12, gap: 0.3, gain: 1, peak: 0.8 },
};
