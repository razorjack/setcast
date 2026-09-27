import type { Theme } from '@setcast/core';
import { packaged } from './packaged.ts';

export const longExposure: Theme = {
  name: 'long-exposure',
  description:
    'A night photograph: the scopes as light trails in sodium amber, lowercase type lit in lime.',
  cssFile: packaged('long-exposure/theme.css'),
  modulation: [
    { source: 'highs', target: 'trail-glow', range: [0.7, 1.5], curve: 'sqrt', smooth: 0.1 },
    {
      source: 'bass',
      target: 'exposure',
      range: [0, 0.35],
      curve: 'pow2',
      smooth: 0.08,
      when: 'drop',
    },
    { source: 'onset', target: 'flare', range: [0, 1], curve: 'pow2', smooth: 0.05 },
  ],
  visualizer: [
    { name: 'vectorscope', gain: 2, trail: 10 },
    { name: 'oscilloscope', gain: 0.85, trail: 8 },
  ],
};
