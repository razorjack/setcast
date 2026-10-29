import { expect, test } from 'vite-plus/test';
import {
  normalizeMix,
  framesWithinMix,
  resolveFrameRange,
  type ResolvedProject,
  type ResolvedLiveProject,
} from '@setcast/core';
import { adjacentBeat, adjacentMark, fitSelection, previewMarks } from './navigation.ts';

const project: ResolvedProject = {
  title: 'Navigation',
  audio: 'mix.wav',
  background: null,
  backgroundFit: 'auto',
  theme: 'test',
  css: '',
  width: 640,
  height: 360,
  fps: 30,
  presentation: 'dj',
  visualizers: [],
  envelope: null,
  travel: null,
  branding: null,
  announcements: [],
  panel: null,
  tracklist: null,
  bpm: 174,
  beatOffset: 0.1,
  clockOffset: 600,
  clockTotal: null,
  modulation: [],
  mix: normalizeMix(
    {
      plays: [
        { id: 'a', title: 'First', at: 0 },
        { id: 'b', title: 'Second', at: 1.001 },
        { id: 'c', title: 'Tied', at: 1.001 },
      ],
      annotations: [
        { kind: 'drop', at: 1.001 },
        { kind: 'note', at: 2, text: 'Blend', scope: { plays: ['b'] } },
      ],
    },
    3.1415,
  ),
};
function scene(bpm: number | null, beatOffset: number): ResolvedLiveProject {
  return {
    ...project,
    title: 'Recall',
    bpm,
    beatOffset,
    audio: null,
    mix: null,
    panel: null,
    tracklist: null,
    live: { clock: false, input: { channels: null, gain: 1, delay: 0 } },
  };
}

test('marks retain ties, scoped labels and first frames at/after absolute moments', () => {
  const marks = previewMarks({ ...project, scenes: [{ at: 2.01, scene: scene(120, 0) }] });
  expect(marks.map(({ frame, kind }) => [frame, kind])).toEqual([
    [0, 'listing'],
    [31, 'listing'],
    [31, 'listing'],
    [31, 'annotation'],
    [60, 'annotation'],
    [61, 'scene'],
  ]);
  expect(marks[4]!.label).toBe('Blend (b)');
  expect(adjacentMark(marks, 31, 1)).toBe(60);
  expect(adjacentMark(marks, 31, -1)).toBe(0);
  expect(adjacentMark(marks, 0, -1)).toBeUndefined();
  expect(adjacentMark(marks, 61, 1)).toBeUndefined();
});

const grids = [24, 30, 60].flatMap((fps) =>
  [120, 174, 299].flatMap((bpm) => [-0.13, 0, 0.1].map((offset) => ({ fps, bpm, offset }))),
);
test.each(grids)(
  'beat stepping across tempo spans at $fps fps, $bpm bpm, offset $offset',
  ({ fps, bpm, offset }) => {
    const fixture = {
      ...project,
      fps,
      bpm,
      beatOffset: offset,
      scenes: [
        { at: 1.001, scene: scene(null, 0) },
        { at: 1.801, scene: scene(113, 0.17) },
      ],
    };
    const count = framesWithinMix(fixture.mix.duration, fps);
    for (const beats of [1, 4] as const) {
      const ordered = enumerateBeats(fixture, beats);
      for (let frame = 0; frame < count; frame++) {
        expect(adjacentBeat(fixture, frame, 1, beats), `${beats}/${frame} next`).toBe(
          ordered.find((target) => target > frame),
        );
        expect(adjacentBeat(fixture, frame, -1, beats), `${beats}/${frame} previous`).toBe(
          ordered.findLast((target) => target < frame),
        );
      }
    }
  },
);
function enumerateBeats(fixture: ResolvedProject, beats: number) {
  const positions = new Set<number>();
  const spans = [{ at: 0, scene: fixture }, ...(fixture.scenes ?? [])];
  const count = framesWithinMix(fixture.mix.duration, fixture.fps);
  for (const [index, span] of spans.entries()) {
    if (!span.scene.bpm) continue;
    const until = spans[index + 1]?.at ?? 3.1415;
    for (let beat = -10; beat < 30; beat++) {
      const at = span.scene.beatOffset + (beat * beats * 60) / span.scene.bpm;
      const target = Math.ceil(at * fixture.fps - 1e-9);
      if (at >= span.at && at < until && target < count) positions.add(target);
    }
  }
  return [...positions].sort((a, b) => a - b);
}

test('frame ranges retain partial final frames and adapt after duration or fps edits', () => {
  const selected = fitSelection(null, 95, 30);
  expect(selected).toEqual({ first: 0, last: 94, fps: 30 });
  expect(resolveFrameRange([0, (selected.last + 1) / 30], 30, 95)).toEqual([0, 94]);
  expect(fitSelection({ first: 60, last: 94, fps: 30 }, 80, 30)).toEqual({
    first: 60,
    last: 79,
    fps: 30,
  });
  expect(fitSelection({ first: 60, last: 94, fps: 30 }, 40, 30)).toEqual({
    first: 39,
    last: 39,
    fps: 30,
  });
  expect(fitSelection({ first: 30, last: 59, fps: 30 }, 190, 60)).toEqual({
    first: 60,
    last: 119,
    fps: 60,
  });
});
