import type { AudioAnalyzer } from '@setcast/core';

export const WINDOW_SECONDS = 10;
export type LoadWindow = (index: number, signal: AbortSignal) => Promise<AudioAnalyzer>;

/** At most two decoded windows; one decoder runs at a time and obsolete seeks are cancelled. */
export class AnalysisWindows {
  private readonly cached = new Map<number, AudioAnalyzer>();
  private pending: { index: number; abort: AbortController; promise: Promise<void> } | null = null;
  private disposed = false;
  readonly load: LoadWindow;
  constructor(load: LoadWindow) {
    this.load = load;
  }
  get size() {
    return this.cached.size;
  }

  at(time: number): AudioAnalyzer | null {
    const index = Math.floor(time / WINDOW_SECONDS);
    const analyzer = this.cached.get(index);
    if (!analyzer) return null;
    this.cached.delete(index);
    this.cached.set(index, analyzer);
    return analyzer;
  }

  prepare(time: number): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const index = Math.floor(time / WINDOW_SECONDS);
    if (this.cached.has(index)) return Promise.resolve();
    if (this.pending?.index === index) return this.pending.promise;
    const previous = this.pending;
    previous?.abort.abort();
    const abort = new AbortController();
    const promise = (previous?.promise.catch(() => {}) ?? Promise.resolve())
      .then(async () => {
        if (abort.signal.aborted) return;
        const analyzer = await this.load(index, abort.signal);
        if (abort.signal.aborted || this.disposed) return;
        this.cached.set(index, analyzer);
        while (this.cached.size > 2) this.cached.delete(this.cached.keys().next().value!);
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted) throw error;
      })
      .finally(() => {
        if (this.pending?.abort === abort) this.pending = null;
      });
    this.pending = { index, abort, promise };
    return promise;
  }

  prefetch(time: number, duration: number): Promise<void> {
    const next = (Math.floor(time / WINDOW_SECONDS) + 1) * WINDOW_SECONDS;
    if (this.pending || next >= duration || next - time > 5) return Promise.resolve();
    return this.prepare(next);
  }

  dispose() {
    this.disposed = true;
    this.pending?.abort.abort();
    this.cached.clear();
  }
}
