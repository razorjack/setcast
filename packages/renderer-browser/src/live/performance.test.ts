import { expect, test } from 'vite-plus/test';
import {
  DEFAULT_PERFORMANCE,
  type PerformanceEvent,
  type ResolvedLiveProject,
} from '@setcast/core';
import { LivePerformance } from './performance.ts';
import { midiMessage, midiKey } from './midi.ts';

test('scene recall waits for its bar, fades to black and waits for readiness', async () => {
  let time = 1;
  let recalled = '';
  const events: PerformanceEvent[] = [];
  const controls = new LivePerformance(
    DEFAULT_PERFORMANCE,
    {
      time: () => time,
      record: (event) => events.push(event),
      recall: (_project, preset) => {
        recalled = preset;
      },
    },
    () => {},
  );
  const completed = controls.queue('saved', {} as ResolvedLiveProject, {
    bpm: 120,
    beatOffset: 0,
    duration: 2,
    quantized: true,
  });
  controls.tick();
  expect(events).toHaveLength(0);
  time = 2;
  controls.tick();
  expect(events[0]?.at).toBe(2);
  time = 2.5;
  expect(controls.value().brightness).toBe(0.5);
  time = 3;
  controls.tick();
  expect(recalled).toBe('saved');
  expect(controls.value().brightness).toBe(0);
  time = 6;
  controls.tick();
  expect(controls.value().brightness).toBe(0);
  controls.ready();
  time = 6.5;
  expect(controls.value().brightness).toBe(0.5);
  time = 7;
  controls.tick();
  expect(controls.transition).toBeNull();
  expect(await completed).toBe(true);
  controls.toggleBlackout();
  expect(controls.value().brightness).toBe(0);
  controls.toggleBlackout();
  expect(controls.value().brightness).toBe(1);
  controls.reset();
  time = 0;
  expect(controls.value()).toEqual(DEFAULT_PERFORMANCE);
});

test('MIDI ignores releases and clock messages, preserving channel and control identity', () => {
  expect(midiMessage([0x90, 36, 0])).toBeNull();
  expect(midiMessage([0x80, 36, 127])).toBeNull();
  expect(midiMessage([0xf8])).toBeNull();
  const message = midiMessage([0xb2, 7, 127])!;
  expect(message).toEqual({ kind: 'cc', channel: 3, number: 7, value: 1 });
  expect(midiKey(message)).toBe('cc:3:7');
});

test('replaced and cancelled recalls settle their completion promises', async () => {
  const controls = new LivePerformance(
    DEFAULT_PERFORMANCE,
    {
      time: () => 0,
      record: () => {},
      recall: () => {},
    },
    () => {},
  );
  const timing = { bpm: 120, beatOffset: 0, duration: 1, quantized: true };
  const first = controls.queue('a', {} as ResolvedLiveProject, timing);
  const second = controls.queue('b', {} as ResolvedLiveProject, timing);
  expect(await first).toBe(false);
  controls.cancel();
  expect(await second).toBe(false);
  for (const cancel of [controls.reset, controls.toggleBlackout]) {
    const pending = controls.queue('a', {} as ResolvedLiveProject, timing);
    cancel();
    expect(await pending).toBe(false);
  }
});
