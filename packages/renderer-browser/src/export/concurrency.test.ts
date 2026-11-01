import { expect, test } from 'vite-plus/test';
import { captureSchedule } from './concurrency.ts';

const frame = { width: 1920, height: 1080, frames: 900 };
const host = { cpuCount: 10, memoryBytes: 32 * 1024 ** 3 };

test('automatic capture bounds its pool by CPU capacity and memory estimates', () => {
  for (const cpuCount of [1, 2, 3, 4, 6, 10, 64]) {
    for (const memoryGiB of [1, 4, 8, 16, 32, 128]) {
      for (const scale of [1, 2, 4]) {
        const schedule = captureSchedule(
          { ...frame, width: frame.width * scale, height: frame.height * scale },
          { cpuCount, memoryBytes: memoryGiB * 1024 ** 3 },
        );
        expect([1, 2, 4]).toContain(schedule.workers);
        expect(schedule.workers).toBeLessThanOrEqual(Math.max(1, Math.floor(cpuCount / 2)));
        assertMemoryBudget(schedule);
      }
    }
  }
});

test('short jobs avoid extra startup and explicit overrides retain their requested pool', () => {
  expect(captureSchedule({ ...frame, frames: 299 }, host)).toMatchObject({
    workers: 1,
    reason: 'short-export',
  });
  expect(captureSchedule({ ...frame, frames: 299, concurrency: 3 }, host)).toMatchObject({
    workers: 3,
    reason: 'explicit',
  });
  expect(captureSchedule({ ...frame, frames: 1, concurrency: 8 }, host).workers).toBe(1);
});

test('resolution and memory constrain the pool without changing the explicit override', () => {
  const limited = { cpuCount: 10, memoryBytes: 8 * 1024 ** 3 };
  expect(captureSchedule(frame, limited).workers).toBe(2);
  const large = { ...frame, width: 7680, height: 4320 };
  expect(captureSchedule(large, limited).workers).toBe(1);
  expect(captureSchedule({ ...large, concurrency: 4 }, limited).workers).toBe(4);
});

function assertMemoryBudget(schedule: ReturnType<typeof captureSchedule>) {
  if (schedule.workers > 1)
    expect(schedule.estimatedMemoryBytes).toBeLessThanOrEqual(schedule.memoryBudgetBytes);
}
