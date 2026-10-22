import { expect, test, vi } from 'vite-plus/test';
import { EnergySelectionSchema, SequenceSchema, SILENCE } from '@setcast/core';
import { LiveEnergy } from './energy.ts';
import { LiveSequence } from './sequence.ts';

const settings = EnergySelectionSchema.parse({ smooth: 0.1, sustain: 2 });
const signal = (energy: number) => ({ ...SILENCE, rms: energy, bass: energy });
function feed(energy: LiveEnergy, from: number, until: number, value: number) {
  for (let step = Math.round(from * 10); step <= Math.round(until * 10); step++)
    energy.update(step / 10, signal(value), settings);
}
test('energy requires sustained classification, rejects transients and uses hysteresis', () => {
  const energy = new LiveEnergy();
  feed(energy, 0, 1.9, 0.1);
  expect(energy.band).toBeNull();
  feed(energy, 2, 3, 0.1);
  expect(energy.band).toBe('low');
  feed(energy, 3.1, 3.5, 0.9);
  feed(energy, 3.6, 6, 0.22);
  expect(energy.band).toBe('low');
  feed(energy, 6.1, 9, 0.4);
  expect(energy.band).toBe('medium');
  feed(energy, 9.1, 12, 0.57);
  expect(energy.band).toBe('medium');
  feed(energy, 12.1, 15, 0.9);
  expect(energy.band).toBe('high');
});
test('capture gaps, backwards time and resets require fresh evidence', () => {
  const energy = new LiveEnergy();
  feed(energy, 0, 3, 0.9);
  expect(energy.band).toBe('high');
  energy.update(50, signal(0.9), settings);
  expect(energy.band).toBeNull();
  feed(energy, 50.1, 53, 0.9);
  energy.update(0, signal(0.1), settings);
  expect(energy.band).toBeNull();
  feed(energy, 0.1, 3, 0.1);
  energy.reset();
  expect(energy.level).toBe(0);
  expect(energy.band).toBeNull();
});
test('energy schema reports invalid choices and overlapping thresholds', () => {
  expect(() => EnergySelectionSchema.parse({ low: 0.5, high: 0.55 })).toThrow(/exceed low/);
  expect(() => EnergySelectionSchema.parse({ sustain: 0 })).toThrow(/at least 1/);
  expect(() =>
    SequenceSchema.parse({ scenes: [{ preset: 'saved-scene-a', energy: 'loud' }] }),
  ).toThrow(/low, medium, high or any/);
});
function sequence(loop = true) {
  const recall = vi.fn(async () => true);
  const control = new LiveSequence(
    SequenceSchema.parse({
      mode: 'energy',
      loop,
      scenes: [
        { preset: 'saved-scene-low', energy: 'low', seconds: 5 },
        { preset: 'saved-scene-high', energy: 'high', seconds: 5 },
        { preset: 'saved-scene-fallback', seconds: 5 },
        { preset: 'saved-scene-high2', energy: 'high', seconds: 5 },
      ],
    }),
    { recall, cancel: vi.fn(), report: vi.fn(), changed: vi.fn() },
  );
  return { control, recall };
}
test('energy selection respects dwell and rotates matching scenes before using fallback', async () => {
  const { control, recall } = sequence();
  control.start('saved-scene-low');
  control.listening.band = 'high';
  control.tick(0, true);
  control.tick(4, true);
  expect(recall).not.toHaveBeenCalled();
  control.tick(5, true);
  await Promise.resolve();
  expect(recall).toHaveBeenLastCalledWith('saved-scene-high');
  control.tick(6, true);
  control.tick(11, true);
  await Promise.resolve();
  expect(recall).toHaveBeenLastCalledWith('saved-scene-high2');
  control.listening.band = 'medium';
  control.tick(12, true);
  control.tick(17, true);
  await Promise.resolve();
  expect(recall).toHaveBeenLastCalledWith('saved-scene-fallback');
  control.listening.band = null;
  control.tick(18, true);
  control.tick(30, true);
  expect(recall).toHaveBeenCalledTimes(3);
});
test('energy holds the only match and never wraps a non-looping sequence', () => {
  const { control, recall } = sequence(false);
  control.start('saved-scene-high2');
  control.listening.band = 'low';
  control.tick(0, true);
  control.tick(5, true);
  expect(recall).not.toHaveBeenCalled();
  expect(control.running).toBe(false);
  const another = sequence();
  another.control.start('saved-scene-low');
  another.control.listening.band = 'low';
  another.control.tick(0, true);
  another.control.tick(5, true);
  expect(another.recall).not.toHaveBeenCalled();
  expect(another.control.running).toBe(true);
});
