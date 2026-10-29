export interface FrameTimings {
  audioMs: number;
  resolveMs: number;
  commitMs: number;
  readinessMs: number;
}
export type BrowserMetric =
  | ({ kind: 'frame'; frame: number; captureMs: number; bytes: number } & FrameTimings)
  | { kind: 'encoder-write' | 'encoder-finish' | 'audio-encode' | 'mux'; milliseconds: number };
export type MetricsReport = (metric: BrowserMetric) => void;

export async function measure<T>(
  kind: 'encoder-write' | 'encoder-finish' | 'audio-encode' | 'mux',
  report: MetricsReport | undefined,
  task: () => Promise<T>,
): Promise<T> {
  const started = performance.now();
  try {
    return await task();
  } finally {
    report?.({ kind, milliseconds: performance.now() - started });
  }
}
