import { createContext, useContext, type ReactNode } from 'react';
import { historyTimes, SILENCE, type AudioAnalyzer, type AudioFeatures } from '../audio.ts';
import type { ResolvedProject } from '../project.ts';
import type { EventState } from '../timeline.ts';

export interface CompositionState {
  width: number;
  height: number;
  durationSeconds: number;
  project: ResolvedProject;
}

/** The contract between a renderer and every Setcast component. Renderer-agnostic by design. */
export interface RenderFrame {
  frame: number;
  fps: number;
  timeSeconds: number;
  audio: AudioFeatures;
  /** Features at other moments, for components that look back; see `useAudioHistory`. */
  analyzer: AudioAnalyzer;
  events: EventState;
  composition: CompositionState;
  /** Resolved modulation targets, e.g. `{ 'bg-zoom': 1.04 }`. Exposed to CSS as `--mod-*`. */
  modulation: Record<string, number>;
}

const FrameContext = createContext<RenderFrame | null>(null);

export function FrameProvider({ frame, children }: { frame: RenderFrame; children: ReactNode }) {
  return <FrameContext value={frame}>{children}</FrameContext>;
}

export function useFrame(): RenderFrame {
  const frame = useContext(FrameContext);
  if (!frame) {
    throw new Error(
      'useFrame() called outside a <FrameProvider>. Setcast components must render inside a renderer adapter (or a test FrameProvider).',
    );
  }
  return frame;
}

export const useTime = (): number => useFrame().timeSeconds;
export const useAudioFeatures = (): AudioFeatures => useFrame().audio;
export const useEventState = (): EventState => useFrame().events;
export const useComposition = (): CompositionState => useFrame().composition;
export const useModulation = (): Record<string, number> => useFrame().modulation;

export interface AudioMoment {
  time: number;
  audio: AudioFeatures;
}

/**
 * The audio at `count` moments over the last `seconds` (at most `HISTORY_SECONDS`), oldest first.
 * Moments before the set starts are silence.
 */
export function useAudioHistory(seconds: number, count: number): AudioMoment[] {
  const { analyzer, timeSeconds } = useFrame();
  return historyTimes(timeSeconds, seconds, count).map((time) => ({
    time,
    audio: time < 0 ? SILENCE : analyzer.featuresAt(time),
  }));
}
