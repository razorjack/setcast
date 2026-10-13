import { describe, expect, test } from 'vite-plus/test';
import { normalizeMix } from './mix.ts';
import type { MixAuthoring } from './mix-schema.ts';
import { Timeline } from './timeline.ts';
import { resolveTracklist, tracklistView, type TracklistCounts } from './tracklist.ts';

const fiveTracks: MixAuthoring = {
  plays: [0, 60, 120, 180, 240].map((at, index) => ({
    id: `t${index + 1}`,
    at,
    title: `T${index + 1}`,
  })),
};

function viewAt(authoring: MixAuthoring, time: number, counts: TracklistCounts) {
  const document = normalizeMix(authoring, 300);
  return tracklistView(document, new Timeline(document).at(time), counts);
}

const summary = (view: ReturnType<typeof viewAt>) =>
  view.rows.map((row) => [row.listing.play, row.state, row.offset, row.presence]);

describe('tracklistView', () => {
  test('shows the window around the current listing once the list has moved on', () => {
    expect(summary(viewAt(fiveTracks, 125, { before: 1, after: 1 }))).toEqual([
      ['t2', 'played', -1, 1],
      ['t3', 'current', 0, 1],
      ['t4', 'upcoming', 1, 1],
    ]);
  });

  test('glides to a new listing, the leaving and entering rows half present halfway', () => {
    const halfway = viewAt(fiveTracks, 120.4, { before: 1, after: 1 });
    expect(summary(halfway)).toEqual([
      ['t1', 'played', -1.5, 0.5],
      ['t2', 'played', -0.5, 1],
      ['t3', 'current', 0.5, 1],
      ['t4', 'upcoming', 1.5, 0.5],
    ]);
  });

  test('clips the window at both ends of the tracklist', () => {
    expect(summary(viewAt(fiveTracks, 10, { before: 2, after: 1 }))).toEqual([
      ['t1', 'current', 0, 1],
      ['t2', 'upcoming', 1, 1],
    ]);
    expect(viewAt(fiveTracks, 250, { before: 1, after: 3 }).rows.map((row) => row.index)).toEqual([
      3, 4,
    ]);
  });

  test('before the first listing, only upcoming rows show', () => {
    const late = {
      plays: [
        { id: 'a', at: 30, title: 'A' },
        { id: 'b', at: 90, title: 'B' },
      ],
    };
    expect(summary(viewAt(late, 10, { before: 2, after: 2 }))).toEqual([
      ['a', 'upcoming', 1, 1],
      ['b', 'upcoming', 2, 1],
    ]);
  });

  test('a play that enters before its listing is current where its row sits', () => {
    const early: MixAuthoring = {
      plays: [
        { id: 'a', at: 0, until: 120, title: 'A' },
        { id: 'b', at: 120, title: 'B', contributions: [{ from: 110, until: 300 }] },
      ],
    };
    expect(summary(viewAt(early, 115, { before: 1, after: 1 }))).toEqual([
      ['a', 'current', 0, 1],
      ['b', 'current', 1, 1],
    ]);
  });

  test('a listed play not heard yet stays upcoming after its listing time', () => {
    const late: MixAuthoring = {
      plays: [
        { id: 'a', at: 0, until: 110, title: 'A' },
        { id: 'b', at: 100, title: 'B', contributions: [{ from: 110, until: 300 }] },
      ],
    };
    expect(viewAt(late, 105, { before: 1, after: 1 }).rows.map((row) => row.state)).toEqual([
      'current',
      'upcoming',
    ]);
  });

  test('tied listings form one group, all of it inside the window', () => {
    const tied = {
      plays: [
        { id: 'a', at: 0, title: 'A' },
        { id: 'b', at: 60, title: 'B' },
        { id: 'c', at: 60, title: 'C' },
        { id: 'd', at: 120, title: 'D' },
      ],
    };
    expect(summary(viewAt(tied, 70, { before: 0, after: 1 }))).toEqual([
      ['b', 'current', 0, 1],
      ['c', 'current', 1, 1],
      ['d', 'upcoming', 2, 1],
    ]);
  });

  test('times the current listing group and the row spans', () => {
    const view = viewAt(fiveTracks, 135, { before: 1, after: 1 });
    expect(view.sinceListing).toBe(15);
    expect(view.untilListing).toBe(45);
    expect(view.rows.map((row) => row.progress)).toEqual([1, 0.25, 0]);
    expect(viewAt(fiveTracks, 250, { before: 0, after: 0 }).untilListing).toBe(Infinity);
  });
});

describe('resolveTracklist', () => {
  test('is off unless the project or the theme turns it on', () => {
    expect(resolveTracklist(undefined, undefined)).toBeNull();
    expect(resolveTracklist(true, undefined)).toEqual({ before: 2, after: 2 });
    expect(resolveTracklist(undefined, { after: 4 })).toEqual({ before: 2, after: 4 });
  });

  test("the project's counts win over the theme's, and false turns the theme's off", () => {
    expect(resolveTracklist({ after: 0 }, { before: 3, after: 4 })).toEqual({
      before: 3,
      after: 0,
    });
    expect(resolveTracklist(true, { before: 3 })).toEqual({ before: 3, after: 2 });
    expect(resolveTracklist(false, { before: 3 })).toBeNull();
  });
});
