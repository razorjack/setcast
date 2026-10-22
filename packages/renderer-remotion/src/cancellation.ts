import { makeCancelSignal } from '@remotion/renderer';

export async function cancellable<T>(
  signal: AbortSignal | undefined,
  task: (cancelSignal: ReturnType<typeof makeCancelSignal>['cancelSignal']) => Promise<T>,
) {
  signal?.throwIfAborted();
  const { cancel, cancelSignal } = makeCancelSignal();
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    return await task(cancelSignal);
  } catch (error) {
    signal?.throwIfAborted();
    throw error;
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
}
