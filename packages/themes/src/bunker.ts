import type { Theme } from '@setcast/core';
import { packaged } from './packaged.ts';

export const bunker: Theme = {
  name: 'bunker',
  description:
    'Your art through an opening in a concrete wall, lit by a work lamp: stencil, riveted plates, hazard tape and a shaking room on the drop.',
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
  visualizer: [
    { name: 'bloom', bands: ['bass', 'highs'], gain: 1.1 },
    { name: 'meters', bands: ['bass', 'mids', 'highs'], segments: 0 },
  ],
};
