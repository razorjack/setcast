import { expect, test, vi } from 'vite-plus/test';
import { renderTracks } from './tracks.ts';

test('audio and video start together, and assembly waits for both', async () => {
  const video = Promise.withResolvers<void>();
  const audio = Promise.withResolvers<void>();
  const starts: string[] = [];
  let finished = false;
  const running = renderTracks(undefined, {
    video: async () => {
      starts.push('video');
      await video.promise;
    },
    audio: async () => {
      starts.push('audio');
      await audio.promise;
    },
  }).then(() => {
    finished = true;
  });
  expect(starts).toEqual(['video', 'audio']);
  audio.resolve();
  await audio.promise;
  expect(finished).toBe(false);
  video.resolve();
  await running;
  expect(finished).toBe(true);
});

test.each(['audio', 'video'] as const)(
  '%s failure cancels its sibling and awaits cleanup',
  async (failed) => {
    const cause = new Error(`${failed} failed`);
    const failure = Promise.withResolvers<void>();
    const cleanup = Promise.withResolvers<void>();
    let aborted: unknown;
    let settled = false;
    const sibling = async (signal: AbortSignal) => {
      signal.addEventListener(
        'abort',
        () => {
          aborted = signal.reason;
        },
        { once: true },
      );
      await cleanup.promise;
      signal.throwIfAborted();
    };
    const tracks =
      failed === 'audio'
        ? { audio: () => failure.promise, video: sibling }
        : { video: () => failure.promise, audio: sibling };
    const running = renderTracks(undefined, tracks).finally(() => {
      settled = true;
    });
    const rejected = expect(running).rejects.toBe(cause);
    failure.reject(cause);
    await vi.waitFor(() => expect(aborted).toBe(cause));
    expect(settled).toBe(false);
    cleanup.resolve();
    await rejected;
  },
);

test('external cancellation reaches both tracks, and pre-aborted jobs start neither', async () => {
  const controller = new AbortController();
  const cause = new Error('Operator cancelled');
  const task = vi.fn(async (signal: AbortSignal) => {
    await new Promise<void>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  });
  const running = renderTracks(controller.signal, { video: task, audio: task });
  const rejected = expect(running).rejects.toBe(cause);
  expect(task).toHaveBeenCalledTimes(2);
  controller.abort(cause);
  await rejected;
  await expect(renderTracks(controller.signal, { video: task, audio: task })).rejects.toBe(cause);
  expect(task).toHaveBeenCalledTimes(2);
});
