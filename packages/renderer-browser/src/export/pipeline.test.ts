import { expect, test, vi } from 'vite-plus/test';
import { pipeline } from './pipeline.ts';

test('capture overlaps ordered writes with a bounded queue and stable worker assignments', async () => {
  const captures = new Map<number, ReturnType<typeof Promise.withResolvers<number>>>();
  const writes = new Map<number, ReturnType<typeof Promise.withResolvers<void>>>();
  const capture = vi.fn((worker: number, frame: number) => {
    expect(worker).toBe((frame - 10) % 2);
    const result = Promise.withResolvers<number>();
    captures.set(frame, result);
    return result.promise;
  });
  const write = vi.fn((image: number, frame: number) => {
    expect(image).toBe(frame);
    const result = Promise.withResolvers<void>();
    writes.set(frame, result);
    return result.promise;
  });
  const cancel = vi.fn(async () => {});
  const running = pipeline({ range: [10, 14], workers: 2, capture, write, cancel });
  await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(2));
  captures.get(11)!.resolve(11);
  await Promise.resolve();
  expect(write).not.toHaveBeenCalled();
  captures.get(10)!.resolve(10);
  await vi.waitFor(() => expect(capture).toHaveBeenCalledTimes(3));
  expect(writes.has(10)).toBe(true);
  // A blocked encoder permits one replacement capture, not an unbounded producer.
  captures.get(12)!.resolve(12);
  await Promise.resolve();
  expect(capture).toHaveBeenCalledTimes(3);
  for (let frame = 10; frame <= 14; frame++) {
    await vi.waitFor(() => expect(writes.has(frame)).toBe(true));
    writes.get(frame)!.resolve();
    if (frame + 3 <= 14) {
      await vi.waitFor(() => expect(captures.has(frame + 3)).toBe(true));
      captures.get(frame + 3)!.resolve(frame + 3);
    }
  }
  await running;
  expect(write.mock.calls.map(([, frame]) => frame)).toEqual([10, 11, 12, 13, 14]);
  expect(capture).toHaveBeenCalledTimes(5);
  expect(cancel).not.toHaveBeenCalled();
});

test('a later capture failure cancels a stalled earlier worker and preserves the cause', async () => {
  const first = Promise.withResolvers<number>();
  const cause = new Error('Missing asset');
  const capture = vi.fn((worker: number) => (worker === 0 ? first.promise : Promise.reject(cause)));
  const write = vi.fn(async () => {});
  const cancel = vi.fn(async () => first.reject(new Error('Page closed')));
  await expect(pipeline({ range: [0, 20], workers: 2, capture, write, cancel })).rejects.toBe(
    cause,
  );
  expect(cancel).toHaveBeenCalledOnce();
  expect(capture).toHaveBeenCalledTimes(2);
  expect(write).not.toHaveBeenCalled();
});

test('capture failure interrupts encoder backpressure and settles pending work', async () => {
  const later = Promise.withResolvers<number>();
  const writing = Promise.withResolvers<void>();
  const cause = new Error('WebGL context lost');
  const write = vi.fn(() => writing.promise);
  const cancel = vi.fn(async () => writing.reject(new Error('Encoder cancelled')));
  const running = pipeline({
    range: [0, 1],
    workers: 1,
    capture: async (_worker, frame) => (frame === 0 ? 0 : later.promise),
    write,
    cancel,
  });
  const rejected = expect(running).rejects.toBe(cause);
  await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
  later.reject(cause);
  await rejected;
  expect(cancel).toHaveBeenCalledOnce();
});

test('encoder failure cancels prefetched captures without writing later frames', async () => {
  const later = Promise.withResolvers<number>();
  const cause = new Error('Disk full');
  const capture = vi.fn(async (_worker: number, frame: number) =>
    frame === 0 ? 0 : later.promise,
  );
  const write = vi.fn(async () => {
    throw cause;
  });
  const cancel = vi.fn(async () => later.reject(new Error('Page closed')));
  await expect(pipeline({ range: [0, 20], workers: 1, capture, write, cancel })).rejects.toBe(
    cause,
  );
  expect(capture).toHaveBeenCalledTimes(2);
  expect(write).toHaveBeenCalledOnce();
  expect(cancel).toHaveBeenCalledOnce();
});

test('a partial final batch never captures outside its inclusive range', async () => {
  const capture = vi.fn(async (_worker: number, frame: number) => frame);
  const frames: number[] = [];
  await pipeline({
    range: [42, 42],
    workers: 8,
    capture,
    write: async (image) => {
      frames.push(image);
    },
    cancel: async () => {},
  });
  expect(capture.mock.calls).toEqual([[0, 42]]);
  expect(frames).toEqual([42]);
});
