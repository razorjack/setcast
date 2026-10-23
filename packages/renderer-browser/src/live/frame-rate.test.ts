import { expect, test } from 'vite-plus/test';
import { FrameRateSampler } from './frame-rate.ts';

const source = {};
const observation = { now: 0, frame: 0, source, available: true, hidden: false };

test('counts observed frame updates, not jumps in the capture frame number', () => {
  const sampler = new FrameRateSampler();
  expect(sampler.sample(observation)).toBeNull();
  for (let index = 1; index < 10; index++)
    expect(sampler.sample({ ...observation, now: index * 100, frame: index * 3 })).toBeUndefined();
  expect(sampler.sample({ ...observation, now: 1000, frame: 30 })).toBe(10);
  expect(sampler.sample({ ...observation, now: 2000, frame: 30 })).toBe(0);
});

test('startup, mute/resume, visibility and new capture sources require a full fresh window', () => {
  for (const changed of [{ available: false }, { hidden: true }, { source: {} }]) {
    const sampler = new FrameRateSampler();
    sampler.sample(observation);
    sampler.sample({ ...observation, now: 500, frame: 1 });
    expect(sampler.sample({ ...observation, ...changed, now: 900, frame: 2 })).toBeNull();
    expect(sampler.sample({ ...observation, ...changed, now: 1000, frame: 3 })).toBeUndefined();
    expect(sampler.sample({ ...observation, now: 1200, frame: 4 })).toBeNull();
    expect(sampler.sample({ ...observation, now: 1500, frame: 5 })).toBeUndefined();
    expect(sampler.sample({ ...observation, now: 2200, frame: 6 })).toBe(2);
  }
});
