import { describe, expect, test, vi } from 'vite-plus/test';
import { holdUntil, type HoldResult } from './hold.ts';

const deferred = () => {
  let resolve = () => {};
  let reject = (_error: unknown) => {};
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

const flush = async () => {
  await new Promise<void>((resolve) => setImmediate(resolve));
};

describe('holdUntil', () => {
  test('releases once and reports success', async () => {
    const release = vi.fn();
    const complete = vi.fn<(result: HoldResult) => void>();
    const load = deferred();
    const cancel = holdUntil(() => load.promise, release, complete);

    load.resolve();
    await flush();
    cancel();
    cancel();

    expect(release).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledWith({ ready: true, error: null });
  });

  test('releases a synchronously throwing loader and normalizes its failure', async () => {
    const release = vi.fn();
    const complete = vi.fn<(result: HoldResult) => void>();
    const cancel = holdUntil(
      () => {
        throw 'invalid image';
      },
      release,
      complete,
    );
    await flush();
    cancel();

    expect(release).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledExactlyOnceWith({
      ready: false,
      error: new Error('invalid image'),
    });
  });

  test('cancellation consumes a late rejection without reporting stale failure', async () => {
    const load = deferred();
    const release = vi.fn();
    const complete = vi.fn<(result: HoldResult) => void>();
    const cancel = holdUntil(() => load.promise, release, complete);
    await flush();
    cancel();
    expect(release).toHaveBeenCalledOnce();

    load.reject(new Error('resource replaced'));
    await flush();
    cancel();
    expect(release).toHaveBeenCalledOnce();
    expect(complete).not.toHaveBeenCalled();
  });

  test('independent holds settle separately even when completed out of order', async () => {
    const first = deferred();
    const second = deferred();
    const firstRelease = vi.fn();
    const secondRelease = vi.fn();
    const firstComplete = vi.fn();
    const secondComplete = vi.fn();
    const cancelFirst = holdUntil(() => first.promise, firstRelease, firstComplete);
    holdUntil(() => second.promise, secondRelease, secondComplete);

    second.resolve();
    await flush();
    expect(secondRelease).toHaveBeenCalledOnce();
    expect(secondComplete).toHaveBeenCalledExactlyOnceWith({ ready: true, error: null });
    expect(firstRelease).not.toHaveBeenCalled();
    expect(firstComplete).not.toHaveBeenCalled();

    cancelFirst();
    first.resolve();
    await flush();
    expect(firstRelease).toHaveBeenCalledOnce();
    expect(firstComplete).not.toHaveBeenCalled();
    expect(secondRelease).toHaveBeenCalledOnce();
  });

  test('releases once and reports failures', async () => {
    const release = vi.fn();
    const complete = vi.fn<(result: HoldResult) => void>();
    const error = new Error('broken asset');
    const load = deferred();
    holdUntil(() => load.promise, release, complete);

    load.reject(error);
    await flush();

    expect(release).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledWith({ ready: false, error });
  });

  test('cancellation releases immediately and ignores late completion', async () => {
    const release = vi.fn();
    const complete = vi.fn<(result: HoldResult) => void>();
    const first = deferred();
    const cancel = holdUntil(() => first.promise, release, complete);

    cancel();
    cancel();
    first.resolve();
    await flush();

    expect(release).toHaveBeenCalledOnce();
    expect(complete).not.toHaveBeenCalled();
  });

  test('changing resources releases the old hold and reports only the new load', async () => {
    const firstRelease = vi.fn();
    const secondRelease = vi.fn();
    const complete = vi.fn<(result: HoldResult) => void>();
    const first = deferred();
    const second = deferred();

    const cancelFirst = holdUntil(() => first.promise, firstRelease, complete);
    cancelFirst();
    holdUntil(() => second.promise, secondRelease, complete);
    first.resolve();
    second.resolve();
    await flush();

    expect(firstRelease).toHaveBeenCalledOnce();
    expect(secondRelease).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledWith({ ready: true, error: null });
  });
});
