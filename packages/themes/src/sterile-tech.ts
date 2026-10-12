import type { Theme } from '@setcast/core';
import { packaged } from './packaged.ts';

export const sterileTech: Theme = {
  name: 'sterile-tech',
  description:
    'Cold steel and frosted glass around your art in its own color; one rust accent, a scan line on every drop.',
  cssFile: packaged('sterile-tech/theme.css'),
  modulation: [
    {
      source: 'bass',
      target: 'bg-zoom',
      range: [1, 1.045],
      curve: 'pow2',
      smooth: 0.08,
      when: 'drop',
    },
    { source: 'onset', target: 'panel-glow', range: [0, 1], curve: 'linear', smooth: 0.12 },
    { source: 'rms', target: 'vignette', range: [0.9, 0.65], curve: 'linear', smooth: 0.3 },
  ],
  visualizer: [
    { name: 'bloom', bands: ['bass', 'highs'], gain: 0.8, lights: 0.02, radius: 0.01 },
    { name: 'spectrum', bars: 64, gap: 0.8, gain: 0.85, floor: 0.04 },
  ],
};
