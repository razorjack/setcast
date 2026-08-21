export type HoldResult = { ready: true; error: null } | { ready: false; error: Error };

export function holdUntil(
  load: () => Promise<unknown>,
  release: () => void,
  complete: (result: HoldResult) => void,
): () => void {
  let live = true;
  let released = false;
  const done = () => {
    if (released) return;
    released = true;
    release();
  };

  void Promise.resolve()
    .then(load)
    .then(
      () => {
        done();
        if (live) complete({ ready: true, error: null });
      },
      (error: unknown) => {
        done();
        if (live)
          complete({
            ready: false,
            error: error instanceof Error ? error : new Error(String(error)),
          });
      },
    );

  return () => {
    live = false;
    done();
  };
}
