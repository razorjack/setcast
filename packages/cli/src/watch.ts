import { unwatchFile, watchFile } from 'node:fs';

/** Debounced, serialized reloads. A failed edit keeps the previous project and remains watched. */
export function watchInputs(
  inputs: Set<string>,
  reload: (dependencies: Set<string>) => Promise<void>,
  onError: (error: unknown) => void,
): () => Promise<void> {
  const watched = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending = Promise.resolve();
  let stopped = false;
  const changed = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      pending = pending.then(refresh);
    }, 100);
  };
  const subscribe = (files: Set<string>) => {
    for (const file of files) {
      if (watched.has(file)) continue;
      watchFile(file, { interval: 200 }, changed);
      watched.add(file);
    }
  };
  const refresh = async () => {
    if (stopped) return;
    const dependencies = new Set<string>();
    try {
      await reload(dependencies);
      for (const file of watched) {
        if (dependencies.has(file)) continue;
        unwatchFile(file, changed);
        watched.delete(file);
      }
    } catch (error) {
      onError(error);
    }
    if (!stopped) subscribe(dependencies);
  };
  subscribe(inputs);
  return async () => {
    stopped = true;
    clearTimeout(timer);
    for (const file of watched) unwatchFile(file, changed);
    await pending;
  };
}
