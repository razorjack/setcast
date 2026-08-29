import {
  evaluateModulation,
  silentAnalyzer,
  Timeline,
  type AudioAnalyzer,
  type ResolvedProject,
} from '@setcast/core';
import { FrameProvider, RendererProvider, Stage, type RenderFrame } from '@setcast/core/react';
import { Audio } from '@remotion/media';
import { useWindowedAudioData } from '@remotion/media-utils';
import { useMemo } from 'react';
import { AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { windowedAnalyzer } from './analyzer.ts';
import { remotionBindings } from './bindings.tsx';

export const COMPOSITION_ID = 'setcast';
const WINDOW_SECONDS = 10;

export function SetcastComposition(project: ResolvedProject) {
  return project.audio ? (
    <WithAudio project={project} />
  ) : (
    <Scene project={project} analyzer={silentAnalyzer} />
  );
}

function WithAudio({ project }: { project: ResolvedProject }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const src = staticFile(project.audio);
  const { audioData, dataOffsetInSeconds } = useWindowedAudioData({
    src,
    frame,
    fps,
    windowInSeconds: WINDOW_SECONDS,
  });
  const analyzer = useMemo(
    () => (audioData ? windowedAnalyzer(audioData, dataOffsetInSeconds, fps) : silentAnalyzer),
    [audioData, dataOffsetInSeconds, fps],
  );
  return (
    <>
      <Scene project={project} analyzer={analyzer} />
      <Audio src={src} />
    </>
  );
}

/** Translates Remotion's frame into a Setcast `RenderFrame` and renders the Stage. */
function Scene({ project, analyzer }: { project: ResolvedProject; analyzer: AudioAnalyzer }) {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const timeline = useMemo(() => new Timeline(project.events), [project.events]);
  const timeSeconds = frame / fps;
  const events = timeline.at(timeSeconds);
  const modulation = evaluateModulation(project.modulation, {
    time: timeSeconds,
    fps,
    events,
    analyzer,
    bpm: project.bpm,
    beatOffset: project.beatOffset,
  });

  const renderFrame: RenderFrame = {
    frame,
    fps,
    timeSeconds,
    audio: analyzer.featuresAt(timeSeconds),
    events,
    composition: { width, height, durationSeconds: durationInFrames / fps, project },
    modulation,
  };

  return (
    <RendererProvider bindings={remotionBindings}>
      <FrameProvider frame={renderFrame}>
        <AbsoluteFill>
          <Stage />
        </AbsoluteFill>
      </FrameProvider>
    </RendererProvider>
  );
}
