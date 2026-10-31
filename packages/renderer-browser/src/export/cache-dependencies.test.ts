import { expect, test } from 'vite-plus/test';
import { messageAt, type ResolvedLiveProject } from '@setcast/core';
import { announcementDependencies } from './cache-dependencies.ts';

const project = {
  fps: 30,
  visualizers: [{ name: 'spectrum' }],
  announcements: [
    { at: 1, seconds: 1, text: 'First' },
    { at: 4, seconds: 1, text: 'Second' },
  ],
};

test('text edits change only intersecting ranges while preserving metadata and indexes', () => {
  const before = announcementDependencies(project)!;
  const after = announcementDependencies({
    ...project,
    announcements: project.announcements.map((entry, index) => ({
      ...entry,
      text: index ? 'Edited' : entry.text,
    })),
  })!;
  expect(before.metadata).toEqual(after.metadata);
  expect(before.texts([0, 29])).toEqual([]);
  expect(before.texts([60, 119])).toEqual([]);
  expect(before.texts([30, 59])).toEqual(after.texts([30, 59]));
  expect(before.texts([119, 120])).toEqual([[1, 'Second']]);
  expect(after.texts([119, 120])).toEqual([[1, 'Edited']]);
  expect(after.texts([150, 179])).toEqual([]);
  for (const announcements of [
    [...project.announcements, { at: 6, seconds: 1, text: 'Added' }],
    project.announcements.slice(1),
    project.announcements.map((entry) => ({ ...entry, at: entry.at + 1 })),
    project.announcements.map((entry) => ({ ...entry, seconds: 2 })),
  ])
    expect(announcementDependencies({ ...project, announcements })!.metadata).not.toEqual(
      before.metadata,
    );
});

test('dependencies cover every displayed frame, including fractional boundaries and overlaps', () => {
  for (const fps of [24, 30, 60]) {
    const announcements = [
      { at: 0.1, seconds: 0.2, text: 'Fractional' },
      { at: 1.01, seconds: 0.77, text: 'Earlier' },
      { at: 1.5, seconds: 0.5, text: 'Replaces earlier' },
    ];
    const scope = announcementDependencies({ ...project, fps, announcements })!;
    for (let first = 0; first < fps * 3; first++) {
      for (const length of [1, 7, fps]) {
        const last = first + length - 1;
        expectCovered({ fps, announcements }, [first, last], scope.texts([first, last]));
      }
    }
  }
});

test('unknown visualizers in either appearance disable local reuse, and snapshots stay stable', () => {
  expect(announcementDependencies({ ...project, announcements: [] })).toBeNull();
  expect(announcementDependencies({ ...project, visualizers: [{ name: 'plugin' }] })).toBeNull();
  expect(
    announcementDependencies({
      ...project,
      scenes: [{ at: 0, scene: { visualizers: [{ name: 'plugin' }] } as ResolvedLiveProject }],
    }),
  ).toBeNull();
  const announcement = { at: 1, seconds: 1, text: 'Before' };
  const scope = announcementDependencies({ ...project, announcements: [announcement] })!;
  announcement.text = 'After';
  expect(scope.texts([30, 59])).toEqual([[0, 'Before']]);
});

function expectCovered(
  scene: Pick<typeof project, 'fps' | 'announcements'>,
  [first, last]: [number, number],
  dependencies: [number, string][],
) {
  for (let frame = first; frame <= last; frame++) {
    const message = messageAt(null, scene.announcements, frame / scene.fps);
    if (message) expect(dependencies).toContainEqual([message.index, message.text]);
  }
}
