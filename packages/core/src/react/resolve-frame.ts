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
import { emptyMixState, type Timeline, type MixState } from '../timeline.ts';
import type { RenderFrame } from './frame.tsx';
import { microseconds, toSeconds } from '../time.ts';

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
  const scene = project.scenes?.findLast((entry) => entry.at <= timeSeconds)?.scene;
  const shown = scene ? sceneAt(project, scene) : project;
  return assembleFrame({
    project: shown,
    analyzer,
    mix: timeline.at(timeSeconds),
    frame,
    fps,
    width,
    height,
    durationSeconds: toSeconds(project.mix.duration),
    announcements: shown.announcements,
  });
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
  return assembleFrame({
    project,
    analyzer,
    mix: emptyMixState(microseconds(frame / project.fps)),
    frame,
    fps: project.fps,
    width: project.width,
    height: project.height,
    durationSeconds: null,
    performance,
    announcements,
  });
}

interface AssemblyRequest {
  project: SceneProject;
  analyzer: AudioAnalyzer;
  mix: MixState;
  frame: number;
  fps: number;
  width: number;
  height: number;
  /** Null for a live performance, which has no known end. */
  durationSeconds: number | null;
  /** Live levels; recorded frames evaluate the project's levels and automation instead. */
  performance?: PerformanceState;
  announcements: readonly Announcement[];
}

function assembleFrame(request: AssemblyRequest): RenderFrame {
  const { project, mix, frame, fps } = request;
  const timeSeconds = frame / fps;
  const performance = request.performance ?? projectPerformance(project, timeSeconds);
  const analyzer = performanceAnalyzer(request.analyzer, performance.intensity);
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
      width: request.width,
      height: request.height,
      durationSeconds: request.durationSeconds,
      project,
      announcements: request.announcements,
      performance: changedPerformance(project, performance),
    },
    modulation,
  };
}

const projectPerformance = (project: SceneProject, timeSeconds: number) =>
  performanceAt(project.performance ?? DEFAULT_PERFORMANCE, project.automation ?? [], timeSeconds);

/** Undefined when nothing changes the levels, so the scene renders without a dimmer. */
function changedPerformance(project: SceneProject, performance: PerformanceState) {
  const unchanged = performance.intensity === 1 && performance.brightness === 1;
  if (!project.performance && !project.automation && unchanged) return undefined;
  return performance;
}
