import { normalizeMix, type ResolvedProject } from '@setcast/core';
import { Composition, type CalculateMetadataFunction } from 'remotion';
import { COMPOSITION_ID, SetcastComposition } from './composition.tsx';
import { framesWithinMix } from './range.ts';

/** Placeholder until the CLI passes a real project as input props. */
const placeholder: ResolvedProject = {
  title: 'Setcast',
  audio: '',
  background: null,
  backgroundFit: 'auto',
  theme: 'none',
  css: '',
  width: 1920,
  height: 1080,
  fps: 30,
  mix: normalizeMix({}, 10),
  presentation: 'playlist',
  modulation: [],
  visualizers: [{ name: 'spectrum' }],
  envelope: null,
  panel: { dwell: 14, fade: 1.2 },
  bpm: null,
  beatOffset: 0,
  clockOffset: 0,
  clockTotal: null,
};

const calculateMetadata: CalculateMetadataFunction<ResolvedProject> = ({ props }) => {
  return {
    durationInFrames: framesWithinMix(props.mix.duration, props.fps),
    fps: props.fps,
    width: props.width,
    height: props.height,
  };
};

export function Root() {
  return (
    <Composition
      id={COMPOSITION_ID}
      component={SetcastComposition}
      defaultProps={placeholder}
      calculateMetadata={calculateMetadata}
    />
  );
}
