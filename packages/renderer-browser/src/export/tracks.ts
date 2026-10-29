/** Both tracks must settle before their shared temporary directory can be removed. */
export async function renderTracks(
  signal: AbortSignal | undefined,
  tracks: {
    video: (signal: AbortSignal) => Promise<unknown>;
    audio: (signal: AbortSignal) => Promise<unknown>;
  },
) {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  const run = async (task: (signal: AbortSignal) => Promise<unknown>) => task(combined);
  const tasks = [run(tracks.video), run(tracks.audio)];
  try {
    await Promise.all(tasks);
  } catch (error) {
    controller.abort(error);
    await Promise.allSettled(tasks);
    throw error;
  }
}
