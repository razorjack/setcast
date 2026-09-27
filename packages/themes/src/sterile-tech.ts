import type { Theme } from '@setcast/core';
import { packaged } from './packaged.ts';

export const sterileTech: Theme = {
  name: 'sterile-tech',
  description: 'Cold steel, frosted glass and one rust accent; a scan line on every drop.',
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
    { source: 'rms', target: 'vignette', range: [0.85, 0.55], curve: 'linear', smooth: 0.3 },
  ],
  visualizer: { name: 'spectrum' },
};
