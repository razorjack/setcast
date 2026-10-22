import { expect, test } from 'vite-plus/test';
import { adaptQuality, fullQuality } from './quality.ts';

test('quality reduces after sustained overload, recovers slowly and stays bounded', () => {
  let state = fullQuality();
  for (let index = 0; index < 2; index++) state = adaptQuality(state, 15, 30, true);
  expect(state.scale).toBe(1);
  state = adaptQuality(state, 15, 30, true);
  expect(state.scale).toBe(0.5);
  for (let index = 0; index < 30; index++) state = adaptQuality(state, 15, 30, true);
  expect(state.scale).toBe(0.25);
  for (let index = 0; index < 14; index++) state = adaptQuality(state, 30, 30, true);
  expect(state.scale).toBe(0.25);
  state = adaptQuality(state, 30, 30, true);
  expect(state.scale).toBe(0.5);
  for (let index = 0; index < 60; index++) state = adaptQuality(state, 30, 30, true);
  expect(state.scale).toBe(1);
});

test('hidden or unavailable input resets the observation window without lowering resolution', () => {
  let state = adaptQuality(fullQuality(), 1, 30, true);
  state = adaptQuality(state, 1, 30, true);
  state = adaptQuality(state, 0, 30, false);
  expect(state).toEqual(fullQuality());
  expect(adaptQuality(state, 1, 30, true).scale).toBe(1);
});
