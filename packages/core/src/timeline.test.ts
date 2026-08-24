import { describe, expect, test } from 'vite-plus/test';
import type { SetEvent } from './events.ts';
import { since, Timeline, until } from './timeline.ts';

const events: SetEvent[] = [
  { type: 'drop', time: 60, intensity: 1 },
  { type: 'track_start', time: 0, title: 'Alpha', artist: 'A', deck: 'A' },
  { type: 'track_start', time: 90, title: 'Beta', artist: 'B', deck: 'B' },
  { type: 'breakdown', time: 75 },
  { type: 'chapter', time: 0, title: 'Intro' },
];

describe('Timeline.at', () => {
  const tl = new Timeline(events);

  test('sorts events and resolves the active track', () => {
    expect(tl.events.map((e) => e.time)).toEqual([0, 0, 60, 75, 90]);
    expect(tl.at(-1).track).toBeNull();
    expect(tl.at(-1).trackIndex).toBe(-1);
    expect(tl.at(-1).trackCount).toBe(2);
    expect(tl.at(0).track).toEqual({ title: 'Alpha', artist: 'A', deck: 'A' });
    expect(tl.at(89.9).trackIndex).toBe(0);
    expect(tl.at(90).track?.title).toBe('Beta');
    expect(tl.at(90).trackIndex).toBe(1);
  });

  test('tracks last/next per type and the current section', () => {
    const s = tl.at(70);
    expect(s.last.drop?.time).toBe(60);
    expect(s.next.breakdown?.time).toBe(75);
    expect(s.next.track_start?.title).toBe('Beta');
    expect(s.section).toBe('drop');
    expect(s.sectionStart).toBe(60);
    expect(since(s, 'drop', 70)).toBe(10);
    expect(until(s, 'track_start', 70)).toBe(20);
    expect(since(s, 'rewind', 70)).toBe(Infinity);

    const later = tl.at(80);
    expect(later.section).toBe('breakdown');
    expect(later.last.drop?.time).toBe(60);
  });

  test('no section before the first section event', () => {
    expect(tl.at(30).section).toBeNull();
  });
});
