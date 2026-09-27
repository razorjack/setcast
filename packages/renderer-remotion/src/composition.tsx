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
  useHoldWhile,
  type RenderFrame,
} from '@setcast/core/react';
import { Audio } from '@remotion/media';
import { useWindowedAudioData } from '@remotion/media-utils';
import { useMemo } from 'react';
import { AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { coversLookback, windowedAnalyzer, type ChannelWindow } from './analyzer.ts';
import { remotionBindings } from './bindings.tsx';
import { audioChannels } from './media.ts';

export const COMPOSITION_ID = 'setcast';

type WindowedAudio = ReturnType<typeof useWindowedAudioData>;
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
  const left = useLoadedChannel(useWindowedAudioData({ ...request, channelIndex: 0 }));
  const right = useLoadedChannel(
    useWindowedAudioData({ ...request, channelIndex: Math.min(1, channels - 1) }),
  );
  // Without data the windowed hook holds the frame itself; with it, the lookback has to be there.
  const lookbackMissing = [left, right].some(
    (channel) => channel && !coversLookback(channel, frame / fps),
  );
  useHoldWhile('audio history', lookbackMissing);

  const analyzer = useMemo(() => {
    if (!left || !right) return silentAnalyzer;
    return windowedAnalyzer({ left, right }, fps);
  }, [left, right, fps]);

  return (
    <>
      <Scene project={project} analyzer={analyzer} />
      <Audio src={src} />
    </>
  );
}

/**
 * The hook's result as a `ChannelWindow`, or null until it has data. Memoized on the data, so the
 * analyzer and its cache survive every frame that reads the same windows.
 */
function useLoadedChannel({ audioData, dataOffsetInSeconds }: WindowedAudio): ChannelWindow | null {
  return useMemo(
    () => (audioData ? { audioData, dataOffsetInSeconds } : null),
    [audioData, dataOffsetInSeconds],
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
    analyzer,
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
