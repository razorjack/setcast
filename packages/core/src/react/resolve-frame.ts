import {
  DEFAULT_PERFORMANCE,
  performanceAt,
  performanceAnalyzer,
  type PerformanceState,
} from '../performance.ts';
import type { AudioAnalyzer } from '../audio.ts';
import type { Announcement } from '../branding.ts';
import { evaluateModulation } from '../modulation.ts';
import type { ResolvedProject, ResolvedLiveProject, SceneProject } from '../project.ts';
import type { Timeline, MixState } from '../timeline.ts';
import type { RenderFrame } from './frame.tsx';
import { microseconds, toSeconds } from '../mix-schema.ts';

export interface FrameRequest {
  project: ResolvedProject;
  timeline: Timeline;
  analyzer: AudioAnalyzer;
  frame: number;
  fps?: number;
  width?: number;
  height?: number;
}

/** Resolve one absolute frame. Display-clock offsets never change performance time. */
export function resolveFrame({
  project,
  timeline,
  analyzer,
  frame,
  fps = project.fps,
  width = project.width,
  height = project.height,
}: FrameRequest): RenderFrame {
  const timeSeconds = frame / fps;
  const selected = project.scenes?.findLast((entry) => entry.at <= timeSeconds)?.scene;
  if (selected) project = sceneAt(project, selected);
  const mix = timeline.at(timeSeconds);
  return assembleFrame(
    { project, analyzer, mix, frame, fps, width, height, announcements: project.announcements },
    toSeconds(project.mix.duration),
  );
}

function sceneAt(project: ResolvedProject, scene: ResolvedLiveProject): ResolvedProject {
  return {
    ...project,
    title: scene.title,
    background: scene.background,
    backgroundFit: scene.backgroundFit,
    theme: scene.theme,
    css: scene.css,
    visualizers: scene.visualizers,
    modulation: scene.modulation,
    bpm: scene.bpm,
    beatOffset: scene.beatOffset,
    branding: scene.branding,
  };
}

export function resolveLiveFrame({
  project,
  analyzer,
  frame,
  performance,
  announcements = [],
}: {
  project: ResolvedLiveProject;
  analyzer: AudioAnalyzer;
  frame: number;
  performance?: PerformanceState;
  /** The session's announcements, timed on the capture clock. */
  announcements?: readonly Announcement[];
}): RenderFrame {
  if (!Number.isSafeInteger(frame) || frame < 0) {
    throw new RangeError(
      `resolveLiveFrame() received frame=${frame}; use a nonnegative safe integer.`,
    );
  }
  const time = microseconds(frame / project.fps);
  const mix: MixState = {
    time,
    currentPlays: [],
    focusPlays: [],
    mixSection: null,
    activeAnnotations: [],
    annotations: { mix: { last: {}, next: {} }, plays: {} },
    nextEntries: [],
    nextListings: [],
    listings: [],
    recordingCount: 0,
    playCount: 0,
    listingCount: 0,
    currentPlayCount: 0,
  };
  return assembleFrame(
    {
      project,
      analyzer,
      mix,
      frame,
      fps: project.fps,
      width: project.width,
      height: project.height,
      performance,
      announcements,
    },
    null,
  );
}

interface AssemblyRequest {
  project: SceneProject;
  analyzer: AudioAnalyzer;
  mix: MixState;
  frame: number;
  fps: number;
  width: number;
  height: number;
  performance?: PerformanceState;
  announcements: readonly Announcement[];
}

function assembleFrame(
  {
    project,
    analyzer,
    mix,
    frame,
    fps,
    width,
    height,
    performance,
    announcements,
  }: AssemblyRequest,
  durationSeconds: number | null,
): RenderFrame {
  const timeSeconds = frame / fps;
  performance ??= performanceAt(
    project.performance ?? DEFAULT_PERFORMANCE,
    project.automation ?? [],
    timeSeconds,
  );
  analyzer = performanceAnalyzer(analyzer, performance.intensity);
  const modulation = evaluateModulation(project.modulation, {
    time: timeSeconds,
    fps,
    mix,
    analyzer,
    bpm: project.bpm,
    beatOffset: project.beatOffset,
  });
  return {
    frame,
    fps,
    timeSeconds,
    audio: analyzer.featuresAt(timeSeconds),
    analyzer,
    mix,
    composition: {
      width,
      height,
      durationSeconds,
      project,
      announcements,
      ...performanceComposition(project, performance),
    },
    modulation,
  };
}

function performanceComposition(project: SceneProject, performance: PerformanceState) {
  if (
    !project.performance &&
    !project.automation &&
    performance.intensity === 1 &&
    performance.brightness === 1
  )
    return {};
  return { performance };
}
