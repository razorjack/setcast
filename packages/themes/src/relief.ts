import type { Theme } from '@setcast/core';
import { packaged } from './packaged.ts';

export const relief: Theme = {
  name: 'relief',
  description:
    'The music as a ridgeline plot engraved over your art: its bright parts raise the lines.',
  cssFile: packaged('relief/theme.css'),
  modulation: [],
  visualizer: { name: 'ridgeline', relief: 0.8, fill: 'art' },
};
