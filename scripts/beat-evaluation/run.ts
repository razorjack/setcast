import { appendFile } from 'node:fs/promises';
import { BeatTracker } from '../../packages/core/src/index.ts';
import type { EvaluationCase, Method } from './config.ts';
import { createMetrics, observe } from './metrics.ts';
import { EVALUATION_RATE, OnsetComparison } from './onsets.ts';
import { readSource } from './source.ts';

export async function evaluate(
  entry: EvaluationCase,
  methods: Method[],
  observationsFile: string,
  signal?: AbortSignal,
) {
  const states = methods.map((method) => {
    const tracker = new BeatTracker();
    tracker.configure(entry.range);
    return { method, tracker, metrics: createMetrics() };
  });
  const onsets = new OnsetComparison(entry.at);
  let frames = 0;
  let analysisMs = 0;
  const started = performance.now();
  for await (const samples of readSource(entry, signal)) {
    signal?.throwIfAborted();
    const batchStart = performance.now();
    const lines: string[] = [];
    for (let index = 0; index < samples.length; index += 2) {
      const onset = onsets.push(samples[index]!, samples[index + 1]!);
      frames++;
      if (onset) measure(states, onset, entry, lines);
    }
    analysisMs += performance.now() - batchStart;
    if (lines.length) await appendFile(observationsFile, lines.join('\n') + '\n');
  }
  if (frames !== Math.round(entry.seconds * EVALUATION_RATE))
    throw new Error(
      `${entry.id}: requested ${entry.seconds}s but decoded ${frames / EVALUATION_RATE}s. Short files are not silently accepted.`,
    );
  return {
    id: entry.id,
    frames,
    seconds: frames / EVALUATION_RATE,
    analysisMs,
    wallMs: performance.now() - started,
    methods: states.map(({ method, metrics }) => ({ method, ...metrics })),
  };
}

function measure(
  states: { method: Method; tracker: BeatTracker; metrics: ReturnType<typeof createMetrics> }[],
  onset: NonNullable<ReturnType<OnsetComparison['push']>>,
  entry: EvaluationCase,
  lines: string[],
) {
  for (const state of states) {
    state.tracker.push({ hop: onset.hop, value: onset.values[state.method] });
    if (onset.hop % 50 !== 0) continue;
    const at = onset.hop / 100;
    const assessment = observe(state.metrics, state.tracker, at, entry);
    lines.push(
      JSON.stringify({
        case: entry.id,
        method: state.method,
        at,
        state: state.tracker.state,
        reason: state.tracker.reason,
        estimate: state.tracker.estimate,
        ...assessment,
      }),
    );
  }
}
