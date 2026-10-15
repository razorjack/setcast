import type { Theme } from '@setcast/core';
import { packaged } from './packaged.ts';

export const darkroom: Theme = {
  name: 'darkroom',
  description:
    'Your art exposed by the music: a spectrogram prints it where the set is loud, the rest stays black.',
  cssFile: packaged('darkroom/theme.css'),
  modulation: [],
  visualizer: { name: 'spectrogram', seconds: 8, gain: 1.2, fill: 'art' },
  tracklist: { before: 2, after: 2 },
};
