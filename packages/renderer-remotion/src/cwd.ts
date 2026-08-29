/**
 * Runs tasks one at a time with `dir` as the working directory, restoring the caller's afterwards.
 * The working directory is process-global, so overlapping tasks would restore it out of order.
 */
export function serializeInDirectory(dir: string) {
  let queue = Promise.resolve();

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    const ahead = queue;
    const { promise, resolve: finished } = Promise.withResolvers<void>();
    queue = promise;
    await ahead;

    const callerCwd = process.cwd();
    try {
      process.chdir(dir);
      return await task();
    } finally {
      try {
        process.chdir(callerCwd);
      } finally {
        finished();
      }
    }
  };
}
