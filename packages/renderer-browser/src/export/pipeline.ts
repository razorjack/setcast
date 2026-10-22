interface Pipeline<T> {
  range: [number, number];
  workers: number;
  capture: (worker: number, frame: number) => Promise<T>;
  write: (image: T, frame: number) => Promise<void>;
  cancel: () => Promise<unknown>;
}

/** One pending capture per worker, plus the image being written. */
export async function pipeline<T>({ range, workers, capture, write, cancel }: Pipeline<T>) {
  const count = Math.min(workers, range[1] - range[0] + 1);
  if (!Number.isSafeInteger(count) || count < 1) throw new RangeError('Invalid capture pool.');
  const failures = failureMonitor();
  const start = (worker: number, frame: number) =>
    failures.observe(Promise.resolve().then(() => capture(worker, frame)));
  const pending: (Promise<T> | undefined)[] = Array.from({ length: count }, (_, index) =>
    start(index, range[0] + index),
  );
  let writing: Promise<void> | undefined;
  try {
    for (let frame = range[0]; frame <= range[1]; frame++) {
      const worker = (frame - range[0]) % count;
      const image = await failures.wait(pending[worker]!);
      const next = frame + count;
      pending[worker] = next <= range[1] ? start(worker, next) : undefined;
      writing = write(image, frame);
      await failures.wait(writing);
      writing = undefined;
    }
  } catch (error) {
    await Promise.allSettled([Promise.resolve().then(cancel)]);
    await Promise.allSettled([...pending, writing]);
    throw error;
  }
}

function failureMonitor() {
  let failure: { error: unknown } | undefined;
  let interrupt: ((error: unknown) => void) | undefined;
  return {
    observe<T>(task: Promise<T>) {
      void task.catch((error: unknown) => {
        failure ??= { error };
        interrupt?.(failure.error);
      });
      return task;
    },
    async wait<T>(task: Promise<T>): Promise<T> {
      // One active waiter avoids retaining a Promise.race listener per exported frame.
      try {
        return await new Promise<T>((resolve, reject) => {
          interrupt = reject;
          void task.then(resolve, reject);
          if (failure) reject(failure.error);
        });
      } finally {
        interrupt = undefined;
      }
    },
  };
}
