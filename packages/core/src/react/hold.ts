export type HoldResult = { ready: true; error: null } | { ready: false; error: Error };

/**
 * Holds a frame until `load` settles: `release` runs exactly once, whether the load succeeded,
 * failed, or the caller cancelled first. Returns the cancel function; after it, `complete` is
 * never called, so a load for a resource nobody waits for any more cannot report a stale result.
 */
export function holdUntil(
  load: () => Promise<unknown>,
  release: () => void,
  complete: (result: HoldResult) => void,
): () => void {
  let live = true;
  let released = false;
  const releaseOnce = () => {
    if (released) return;
    released = true;
    release();
  };

  void Promise.resolve()
    .then(load)
    .then(
      () => {
        releaseOnce();
        if (live) complete({ ready: true, error: null });
      },
      (error: unknown) => {
        releaseOnce();
        if (!live) return;
        complete({ ready: false, error: asError(error) });
      },
    );

  return () => {
    live = false;
    releaseOnce();
  };
}

const asError = (thrown: unknown): Error =>
  thrown instanceof Error ? thrown : new Error(String(thrown));
