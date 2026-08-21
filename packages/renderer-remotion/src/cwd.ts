export function serializeInDirectory(dir: string) {
  let queue = Promise.resolve();

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    const previous = queue;
    let release = () => {};
    queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    const cwd = process.cwd();
    try {
      process.chdir(dir);
      return await task();
    } finally {
      try {
        process.chdir(cwd);
      } finally {
        release();
      }
    }
  };
}
