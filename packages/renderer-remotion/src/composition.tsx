import {
  FEATURE_SOURCES,
  visualizers,
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
  useAssetUrl,
  useHoldWhile,
  resolveFrame,
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

export function SetcastComposition(
  project: ResolvedProject & { previewRevision?: number; renderAudio?: boolean },
) {
  const revision = project.previewRevision;
  const bindings = useMemo(
    () =>
      revision === undefined
        ? remotionBindings
        : {
            ...remotionBindings,
            asset: (path: string) => `${staticFile(path)}?revision=${revision}`,
          },
    [revision],
  );
  return (
    <RendererProvider bindings={bindings}>
      {project.audio ? (
        <WithAudio project={project} renderAudio={project.renderAudio !== false} />
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

function WithAudio({ project, renderAudio }: { project: ResolvedProject; renderAudio: boolean }) {
  const src = useAssetUrl(project.audio);
  return (
    <>
      {needsAudioAnalysis(project) ? (
        <AnalyzedAudio project={project} src={src} />
      ) : (
        <Scene project={project} analyzer={silentAnalyzer} />
      )}
      {renderAudio && <Audio src={src} />}
    </>
  );
}

function AnalyzedAudio({ project, src }: StereoAudioProps) {
  const channels = useChannelCount(src);
  if (channels === null) return null;
  return channels === 1 ? (
    <MonoAudio project={project} src={src} />
  ) : (
    <StereoAudio project={project} src={src} />
  );
}

interface StereoAudioProps {
  project: ResolvedProject;
  src: string;
}

/** Loads both channels around the current frame. */
function StereoAudio({ project, src }: StereoAudioProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const request = { src, frame, fps, windowInSeconds: WINDOW_SECONDS };
  const left = useLoadedChannel(useWindowedAudioData({ ...request, channelIndex: 0 }));
  const right = useLoadedChannel(useWindowedAudioData({ ...request, channelIndex: 1 }));
  return <LoadedAudio project={project} left={left} right={right} />;
}

function MonoAudio({ project, src }: StereoAudioProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const channel = useLoadedChannel(
    useWindowedAudioData({ src, frame, fps, windowInSeconds: WINDOW_SECONDS, channelIndex: 0 }),
  );
  return <LoadedAudio project={project} left={channel} right={channel} />;
}

function LoadedAudio({
  project,
  left,
  right,
}: {
  project: ResolvedProject;
  left: ChannelWindow | null;
  right: ChannelWindow | null;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Without data the windowed hook holds the frame itself; with it, the lookback has to be there.
  const lookbackMissing = [left, right].some(
    (channel) => channel && !coversLookback(channel, frame / fps),
  );
  useHoldWhile('audio history', lookbackMissing);

  const analyzer = useMemo(() => {
    if (!left || !right) return silentAnalyzer;
    return windowedAnalyzer({ left, right }, fps);
  }, [left, right, fps]);

  return <Scene project={project} analyzer={analyzer} />;
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
  const { fps, width, height } = useVideoConfig();
  const timeline = useMemo(() => new Timeline(project.mix), [project.mix]);
  const renderFrame = resolveFrame({ project, timeline, analyzer, frame, fps, width, height });

  return (
    <FrameProvider frame={renderFrame}>
      <AbsoluteFill>
        <Stage />
      </AbsoluteFill>
    </FrameProvider>
  );
}

function needsAudioAnalysis(project: ResolvedProject): boolean {
  return (
    project.visualizers.some((config) => visualizers.get(config.name).audio !== false) ||
    project.modulation.some((route) => FEATURE_SOURCES.some((source) => source === route.source))
  );
}
