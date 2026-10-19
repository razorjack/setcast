import type { AudioAnalyzer } from '../audio.ts';
import { evaluateModulation } from '../modulation.ts';
import type { ResolvedProject } from '../project.ts';
import type { Timeline } from '../timeline.ts';
import type { RenderFrame } from './frame.tsx';

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
  const mix = timeline.at(timeSeconds);
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
    composition: { width, height, durationSeconds: project.mix.duration / 1_000_000, project },
    modulation,
  };
}
