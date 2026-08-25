import type { ResolvedProject } from '@setcast/core';
import { ALL_FORMATS, Input, UrlSource } from 'mediabunny';
import { Composition, staticFile, type CalculateMetadataFunction } from 'remotion';
import { COMPOSITION_ID, SetcastComposition } from './composition.tsx';

/** Placeholder until the CLI passes a real project as input props. */
const placeholder: ResolvedProject = {
  title: 'Setcast',
  audio: '',
  background: null,
  theme: 'none',
  css: '',
  width: 1920,
  height: 1080,
  fps: 30,
  events: [],
  modulation: [],
  visualizer: { name: 'spectrum' },
  panel: { dwell: 14, fade: 1.2 },
};

const calculateMetadata: CalculateMetadataFunction<ResolvedProject> = async ({ props }) => {
  const durationSeconds = props.audio ? await audioDuration(staticFile(props.audio)) : 10;
  return {
    durationInFrames: Math.max(1, Math.ceil(durationSeconds * props.fps)),
    fps: props.fps,
    width: props.width,
    height: props.height,
  };
};

async function audioDuration(url: string): Promise<number> {
  const input = new Input({ formats: ALL_FORMATS, source: new UrlSource(url) });
  try {
    return (await input.getDurationFromMetadata()) ?? (await input.computeDuration());
  } finally {
    input.dispose();
  }
}

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
