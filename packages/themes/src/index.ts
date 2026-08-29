import { fileURLToPath } from 'node:url';
import type { Theme } from '@setcast/core';

const packaged = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));

export const sterileTech: Theme = {
  name: 'sterile-tech',
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
};

export const themes: Record<string, Theme> = { [sterileTech.name]: sterileTech };
