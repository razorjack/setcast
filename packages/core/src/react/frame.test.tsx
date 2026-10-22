import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vite-plus/test';
import { SILENCE, type AudioAnalyzer } from '../audio.ts';
import { normalizeMix } from '../mix.ts';
import type { ResolvedProject } from '../project.ts';
import { Timeline } from '../timeline.ts';
import {
  audioHistory,
  FrameProvider,
  useAudioFeatures,
  useAudioHistory,
  useComposition,
  useFrame,
  useMixState,
  useModulation,
  useTime,
  type RenderFrame,
} from './frame.tsx';

const mix = normalizeMix({ plays: [{ title: 'Test', at: 0 }] }, 30);
const timeline = new Timeline(mix);
const project: ResolvedProject = {
  title: 'Frame contract',
  clockOffset: 600,
  clockTotal: 900,
  audio: 'audio.wav',
  background: null,
  backgroundFit: 'auto',
  theme: 'test',
  css: '',
  width: 1920,
  height: 1080,
  fps: 30,
  mix,
  presentation: 'playlist',
  modulation: [],
  visualizers: [],
  envelope: null,
  travel: null,
  branding: null,
  announcements: [],
  panel: null,
  tracklist: null,
  bpm: null,
  beatOffset: 0,
};

function frameAt(timeSeconds: number, analyzer: AudioAnalyzer): RenderFrame {
  return {
    frame: Math.round(timeSeconds * 30),
    fps: 30,
    timeSeconds,
    audio: { ...SILENCE, bass: 0.75 },
    analyzer,
    mix: timeline.at(timeSeconds),
    composition: { width: 1920, height: 1080, durationSeconds: 30, project, announcements: [] },
    modulation: { glow: 0.4 },
  };
}

describe('RenderFrame context', () => {
  test('hooks return the supplied frame and its actual fields without reconstructing time', () => {
    const analyzer = { featuresAt: vi.fn(() => SILENCE) };
    const frame = { ...frameAt(1.25, analyzer), frame: 999, fps: 60 };
    function ReadFrame() {
      expect(useFrame()).toBe(frame);
      expect(useTime()).toBe(1.25);
      expect(useAudioFeatures()).toBe(frame.audio);
      expect(useMixState()).toBe(frame.mix);
      expect(useComposition()).toBe(frame.composition);
      expect(useModulation()).toBe(frame.modulation);
      expect(useAudioHistory(1, 2)).toEqual([
        { time: 0.5, audio: SILENCE },
        { time: 1, audio: SILENCE },
      ]);
      return null;
    }
    renderToStaticMarkup(
      <FrameProvider frame={frame}>
        <ReadFrame />
      </FrameProvider>,
    );
    expect(analyzer.featuresAt.mock.calls).toEqual([[0.5], [1]]);
  });

  test('every public frame hook identifies a missing provider', () => {
    const hooks = [
      useFrame,
      useTime,
      useAudioFeatures,
      useMixState,
      useComposition,
      useModulation,
      () => useAudioHistory(1, 2),
    ];
    for (const useHook of hooks) {
      function MissingProvider() {
        useHook();
        return null;
      }
      expect(() => renderToStaticMarkup(<MissingProvider />)).toThrow(
        /useFrame\(\) called outside a <FrameProvider>.*renderer adapter/,
      );
    }
  });
});

describe('audioHistory', () => {
  test('returns moments oldest first and never asks the analyzer for negative time', () => {
    const featuresAt = vi.fn((time: number) => ({ ...SILENCE, bass: time + 0.1 }));
    const moments = audioHistory(frameAt(0.6, { featuresAt }), 2, 4);
    expect(moments.map(({ time }) => time)).toEqual([-1, -0.5, 0, 0.5]);
    expect(moments[0]!.audio).toBe(SILENCE);
    expect(moments[1]!.audio).toBe(SILENCE);
    expect(moments[2]!.audio.bass).toBe(0.1);
    expect(moments[3]!.audio.bass).toBe(0.6);
    expect(featuresAt.mock.calls).toEqual([[0], [0.5]]);
  });

  test('repeated and randomly ordered frames have the same samples and do not mutate frames', () => {
    const analyzer: AudioAnalyzer = {
      featuresAt: (time) => ({ ...SILENCE, bass: time / 30 }),
    };
    const times = [0.2, 1.2, 5.4, 10.8];
    const expected = times.map((time) => audioHistory(frameAt(time, analyzer), 2, 4));
    for (const index of [3, 0, 2, 1, 0, 3]) {
      const frame = Object.freeze(frameAt(times[index]!, analyzer));
      expect(audioHistory(frame, 2, 4)).toEqual(expected[index]);
      expect(audioHistory(frame, 2, 4)).toEqual(expected[index]);
    }
  });
});
