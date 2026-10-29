import { describe, expect, test, vi } from 'vite-plus/test';
import { PreviewQueue, previewFrame } from './queue.ts';

function pending() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe('preview seeks', () => {
  test('audio-clock mode reports completed frames without growing the pending queue', async () => {
    const first = pending();
    const last = pending();
    const render = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(last.promise);
    const ready = vi.fn();
    const queue = new PreviewQueue(render, ready, vi.fn(), true);
    queue.request(0);
    queue.request(3);
    queue.request(12);
    first.resolve();
    await first.promise;
    expect(ready.mock.calls).toEqual([[0]]);
    expect(render.mock.calls).toEqual([[0], [12]]);
    last.resolve();
    await last.promise;
    expect(ready.mock.calls).toEqual([[0], [12]]);
  });
  test('serializes rendering and publishes only the newest requested frame', async () => {
    const first = pending();
    const last = pending();
    const render = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(last.promise);
    const ready = vi.fn();
    const fail = vi.fn();
    const queue = new PreviewQueue(render, ready, fail);
    queue.request(0);
    queue.request(4);
    queue.request(19);
    expect(render.mock.calls).toEqual([[0]]);
    first.resolve();
    await first.promise;
    expect(render.mock.calls).toEqual([[0], [19]]);
    expect(ready).not.toHaveBeenCalled();
    last.resolve();
    await last.promise;
    expect(ready).toHaveBeenCalledExactlyOnceWith(19);
    expect(fail).not.toHaveBeenCalled();
  });
  test('closing suppresses stale completions and queued seeks', async () => {
    const frame = pending();
    const render = vi.fn(() => frame.promise);
    const ready = vi.fn();
    const queue = new PreviewQueue(render, ready, vi.fn());
    queue.request(1);
    queue.request(2);
    queue.close();
    frame.resolve();
    await frame.promise;
    queue.request(3);
    expect(render).toHaveBeenCalledTimes(1);
    expect(ready).not.toHaveBeenCalled();
  });
  test('a failed driver is not reused until the preview is remounted', async () => {
    const error = new Error('asset unavailable');
    const render = vi.fn().mockRejectedValue(error);
    const fail = vi.fn();
    const queue = new PreviewQueue(render, vi.fn(), fail);
    queue.request(5);
    await Promise.resolve();
    queue.request(6);
    expect(render).toHaveBeenCalledTimes(1);
    expect(fail).toHaveBeenCalledExactlyOnceWith(error);
  });
  test('seeks stay within the finite frame interval', () => {
    expect([-5, 1.9, 94, 95, Infinity, NaN].map((frame) => previewFrame(frame, 95))).toEqual([
      0, 1, 94, 94, 0, 0,
    ]);
  });
});
