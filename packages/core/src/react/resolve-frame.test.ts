import { expect, test } from 'vite-plus/test';
import { SILENCE, type AudioAnalyzer } from '../audio.ts';
import { normalizeMix } from '../mix.ts';
import { ModPatchSchema } from '../modulation.ts';
import type { ResolvedProject } from '../project.ts';
import { Timeline } from '../timeline.ts';
import { framesWithinMix } from '../frame-time.ts';
import { resolveFrame } from './resolve-frame.ts';

const project: ResolvedProject = {
  title: 'Frame assembly',
  audio: 'set.wav',
  background: null,
  backgroundFit: 'auto',
  theme: 'test',
  css: '',
  width: 1920,
  height: 1080,
  fps: 30,
  mix: normalizeMix(
    {
      plays: [
        { id: 'first', title: 'First', at: 0 },
        { id: 'second', title: 'Second', at: 1 },
      ],
      annotations: [{ kind: 'drop', at: 1 }],
    },
    2.000001,
  ),
  presentation: 'playlist',
  visualizers: [],
  envelope: null,
  travel: null,
  panel: null,
  tracklist: null,
  bpm: 120,
  beatOffset: 0,
  clockOffset: 600,
  clockTotal: 900,
  modulation: ModPatchSchema.parse([
    { source: 'bass', target: 'audio' },
    { source: 'since:drop', target: 'cue', window: 1 },
    { source: 'beat', target: 'beat' },
  ]),
};
const timeline = new Timeline(project.mix);
const audio = { ...SILENCE, bass: 0.25 };
const analyzer: AudioAnalyzer = { featuresAt: () => audio };

test('frame assembly respects renderer settings and preserves supplied identities', () => {
  const frame = resolveFrame({
    project,
    timeline,
    analyzer,
    frame: 75,
    fps: 60,
    width: 720,
    height: 1280,
  });
  expect(frame.timeSeconds).toBe(1.25);
  expect(frame.fps).toBe(60);
  expect(frame.audio).toBe(audio);
  expect(frame.analyzer).toBe(analyzer);
  expect(frame.composition).toEqual({
    width: 720,
    height: 1280,
    durationSeconds: 2.000001,
    project,
  });
  expect(frame.composition.project).toBe(project);
  expect(frame.mix.currentPlays.map((play) => play.play.id)).toEqual(['second']);
  expect(frame.modulation).toEqual({ audio: 0.25, cue: 0.75, beat: 0.5 });
});

test('audio and timeline use the same unshifted instant after random seeks', () => {
  const requested: number[] = [];
  const source: AudioAnalyzer = {
    featuresAt: (time) => {
      requested.push(time);
      return audio;
    },
  };
  for (const frame of [45, 0, 30, 59, 15, 45, 0]) {
    const resolved = resolveFrame({ project, timeline, analyzer: source, frame });
    expect(resolved.mix).toEqual(new Timeline(project.mix).at(frame / 30));
    expect(resolved.timeSeconds).toBe(frame / 30);
    expect(resolved.composition.width).toBe(1920);
  }
  expect(requested).toEqual([1.5, 1.5, 0, 0, 1, 1, 59 / 30, 59 / 30, 0.5, 0.5, 1.5, 1.5, 0, 0]);
});

test('last frames stay inside the finite mix, including a rounded microsecond endpoint', () => {
  for (const duration of [0.066667, 0.066668, 2.000001]) {
    const next = { ...project, mix: normalizeMix({}, duration), modulation: [] };
    const indexed = new Timeline(next.mix);
    const last = framesWithinMix(next.mix.duration, next.fps) - 1;
    expect(() =>
      resolveFrame({ project: next, timeline: indexed, analyzer, frame: last }),
    ).not.toThrow();
    expect(() =>
      resolveFrame({ project: next, timeline: indexed, analyzer, frame: last + 1 }),
    ).toThrow();
  }
});
