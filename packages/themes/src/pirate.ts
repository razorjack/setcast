import type { Theme } from '@setcast/core';
import { packaged } from './packaged.ts';

export const pirate: Theme = {
  name: 'pirate',
  description:
    'A photocopied rave flyer: your art as a grey copy, credits on taped slips, a torn fluoro strip rising with the music.',
  cssFile: packaged('pirate/theme.css'),
  modulation: [],
  visualizer: { name: 'spectrum', style: 'line', bars: 64 },
};
