import {
  normalizeMix,
  PANEL_DEFAULTS,
  TRACKLIST_DEFAULTS,
  type ResolvedProject,
} from '@setcast/core';
import { expect, test } from 'vite-plus/test';
import { creditsOf, withArt, withCredits } from './overrides.ts';

const mix = normalizeMix(
  {
    plays: [
      { artist: 'A', title: 'One', at: 0, background: 'one.png' },
      { artist: 'B', title: 'Two', at: 5 },
    ],
  },
  10,
);
const project = {
  background: 'bg.png',
  mix,
  panel: { dwell: 0, fade: 2 },
  tracklist: null,
} as unknown as ResolvedProject;

test('credits keep the timing and counts the project chose and fill in defaults otherwise', () => {
  expect(creditsOf(project)).toBe('panels');
  const both = withCredits(project, 'both');
  expect(both.panel).toEqual({ dwell: 0, fade: 2 });
  expect(both.tracklist).toEqual(TRACKLIST_DEFAULTS);
  expect(creditsOf(both)).toBe('both');

  const listed = withCredits({ ...project, panel: null }, 'tracklist');
  expect(listed.panel).toBeNull();
  expect(withCredits(listed, 'panels').panel).toEqual(PANEL_DEFAULTS);
  expect(withCredits(project, null)).toBe(project);
});

test('chosen art replaces the project and every play background, keeping the file name', () => {
  expect(withArt(project, { kind: 'project' })).toBe(project);
  const file = withArt(project, { kind: 'file', url: 'blob:http://x/1', name: 'loop.mp4' });
  expect(file.background).toBe('blob:http://x/1#loop.mp4');
  expect(file.mix.plays.map((play) => play.background)).toEqual([undefined, undefined]);
  expect(project.mix.plays[0]?.background).toBe('one.png');
  expect(withArt(project, { kind: 'none' }).background).toBeNull();
});
