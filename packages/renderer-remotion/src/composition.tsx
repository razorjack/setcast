import {
  evaluateModulation,
  silentAnalyzer,
  Timeline,
  type AudioAnalyzer,
  type ResolvedProject,
} from '@setcast/core';
import {
  FrameProvider,
  RendererProvider,
  Stage,
  useHoldUntil,
  type RenderFrame,
} from '@setcast/core/react';
import { Audio } from '@remotion/media';
import { useWindowedAudioData } from '@remotion/media-utils';
import { useMemo } from 'react';
import { AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { windowedAnalyzer } from './analyzer.ts';
import { remotionBindings } from './bindings.tsx';
import { audioChannels } from './media.ts';

export const COMPOSITION_ID = 'setcast';
const WINDOW_SECONDS = 10;

export function SetcastComposition(project: ResolvedProject) {
  return (
    <RendererProvider bindings={remotionBindings}>
      {project.audio ? (
        <WithAudio project={project} />
      ) : (
        <Scene project={project} analyzer={silentAnalyzer} />
      )}
    </RendererProvider>
  );
}

/** A channel count never changes mid-render, so one read per source is enough. */
const channelCounts = new Map<string, number>();

/** Channels in the set audio, or null until they are read. Holds the frame meanwhile. */
function useChannelCount(src: string): number | null {
  const ready = useHoldUntil(`channels:${src}`, async () => {
    if (!channelCounts.has(src)) channelCounts.set(src, await audioChannels(src));
  });
  return ready ? (channelCounts.get(src) ?? null) : null;
}

function WithAudio({ project }: { project: ResolvedProject }) {
  const src = staticFile(project.audio);
  const channels = useChannelCount(src);
  if (channels === null) return null;
  return <StereoAudio project={project} src={src} channels={channels} />;
}

interface StereoAudioProps {
  project: ResolvedProject;
  src: string;
  channels: number;
}

/** Loads both channels around the current frame; mono audio loads its one channel twice. */
function StereoAudio({ project, src, channels }: StereoAudioProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const request = { src, frame, fps, windowInSeconds: WINDOW_SECONDS };
  const left = useWindowedAudioData({ ...request, channelIndex: 0 });
  const right = useWindowedAudioData({ ...request, channelIndex: Math.min(1, channels - 1) });

  const analyzer = useMemo(() => {
    if (!left.audioData || !right.audioData) return silentAnalyzer;
    return windowedAnalyzer(
      {
        left: { audioData: left.audioData, dataOffsetInSeconds: left.dataOffsetInSeconds },
        right: { audioData: right.audioData, dataOffsetInSeconds: right.dataOffsetInSeconds },
      },
      fps,
    );
  }, [left.audioData, left.dataOffsetInSeconds, right.audioData, right.dataOffsetInSeconds, fps]);

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
    <FrameProvider frame={renderFrame}>
      <AbsoluteFill>
        <Stage />
      </AbsoluteFill>
    </FrameProvider>
  );
}
