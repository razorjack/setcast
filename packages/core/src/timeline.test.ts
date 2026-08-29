import { describe, expect, test } from 'vite-plus/test';
import type { SetEvent } from './events.ts';
import { lastEvent, since, Timeline, until } from './timeline.ts';

const events: SetEvent[] = [
  { type: 'drop', time: 60, intensity: 1 },
  { type: 'track_start', time: 0, title: 'Alpha', artist: 'A', deck: 'A' },
  { type: 'track_start', time: 90, title: 'Beta', artist: 'B', deck: 'B' },
  { type: 'breakdown', time: 75 },
  { type: 'chapter', time: 0, title: 'Intro' },
];

describe('Timeline.at', () => {
  const timeline = new Timeline(events);

  test('sorts events and resolves the active track', () => {
    expect(timeline.events.map((event) => event.time)).toEqual([0, 0, 60, 75, 90]);
    expect(timeline.at(-1).track).toBeNull();
    expect(timeline.at(-1).trackIndex).toBe(-1);
    expect(timeline.at(-1).trackCount).toBe(2);
    expect(timeline.at(0).track).toEqual({ title: 'Alpha', artist: 'A', deck: 'A' });
    expect(timeline.at(89.9).trackIndex).toBe(0);
    expect(timeline.at(90).track?.title).toBe('Beta');
    expect(timeline.at(90).trackIndex).toBe(1);
  });

  test('tracks last/next per type and the current section', () => {
    const state = timeline.at(70);
    expect(state.last.drop?.time).toBe(60);
    expect(state.next.breakdown?.time).toBe(75);
    expect(state.next.track_start?.title).toBe('Beta');
    expect(state.section).toBe('drop');
    expect(state.sectionStart).toBe(60);
    expect(since(state, 'drop', 70)).toBe(10);
    expect(until(state, 'track_start', 70)).toBe(20);
    expect(since(state, 'rewind', 70)).toBe(Infinity);

    const later = timeline.at(80);
    expect(later.section).toBe('breakdown');
    expect(later.last.drop?.time).toBe(60);
  });

  test('no section before the first section event', () => {
    expect(timeline.at(30).section).toBeNull();
  });

  test('the deck in front comes from the latest event that names one', () => {
    expect(timeline.at(-1).deck).toBeNull();
    expect(timeline.at(0).deck).toBe('A');
    expect(timeline.at(90).deck).toBe('B');
    const switched = new Timeline([...events, { type: 'switch', time: 30, deck: 'D' }]);
    expect(switched.at(40).deck).toBe('D');
  });

  test('a double drop is a drop for since and until', () => {
    const doubled = new Timeline([...events, { type: 'double_drop', time: 80, intensity: 0.5 }]);
    expect(since(doubled.at(85), 'drop', 85)).toBe(5);
    expect(until(doubled.at(70), 'drop', 70)).toBe(10);
    expect(lastEvent(doubled.at(85), 'drop')?.intensity).toBe(0.5);
  });
});
