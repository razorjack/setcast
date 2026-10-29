import { execFileSync } from 'node:child_process';
import { parseProcesses, processDelta, type ProcessSample } from './process-snapshot.ts';

const scope =
  'Sampled Node and descendants; summed RSS can double-count shared pages. CPU deltas exclude new/exited processes and can miss short-lived work. External CPU is other visible processes, including OS services, not a specific project. GPU/encoder services outside the tree remain external. No process names or arguments are retained.';

interface Snapshot {
  at: number;
  rows: Map<number, ProcessSample>;
}

function snapshot(): Snapshot {
  const started = performance.now();
  // Async delivery can lag behind ps during bundling, pairing old counters with a new timestamp.
  const stdout = execFileSync('ps', ['-axo', 'pid=,ppid=,rss=,time=,lstart='], {
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C' },
    timeout: 2000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const at = (started + performance.now()) / 2;
  const rows = parseProcesses(stdout);
  if (!rows.has(process.pid)) throw new Error('ps omitted the benchmark process.');
  return { at, rows };
}

export async function measureProcesses() {
  const totals = {
    samples: 0,
    intervals: 0,
    failedSamples: 0,
    seconds: 0,
    treeCpuSeconds: 0,
    externalCpuSeconds: 0,
    rssPeakBytes: 0,
    maxTreeCpuCores: 0,
    maxExternalCpuCores: 0,
  };
  let previous: Snapshot | undefined;
  let error: string | null = null;
  const sample = async () => {
    try {
      if (!['darwin', 'linux'].includes(process.platform))
        throw new Error('Process sampling supports macOS and Linux.');
      const next = snapshot();
      accumulate(totals, previous, next);
      previous = next;
    } catch (cause) {
      totals.failedSamples++;
      error = cause instanceof Error ? cause.message.split('\n')[0]! : String(cause);
      previous = undefined;
    }
  };
  await sample();
  let pending: Promise<void> | undefined;
  const timer = setInterval(() => {
    pending ??= sample().finally(() => {
      pending = undefined;
    });
  }, 1000);
  let stopped: Promise<ReturnType<typeof report>> | undefined;
  return {
    stop() {
      clearInterval(timer);
      stopped ??= Promise.resolve(pending).then(() => report(totals, error));
      return stopped;
    },
  };
}

interface Totals {
  samples: number;
  intervals: number;
  failedSamples: number;
  seconds: number;
  treeCpuSeconds: number;
  externalCpuSeconds: number;
  rssPeakBytes: number;
  maxTreeCpuCores: number;
  maxExternalCpuCores: number;
}

function accumulate(totals: Totals, previous: Snapshot | undefined, next: Snapshot) {
  const delta = processDelta(previous?.rows ?? new Map(), next.rows, process.pid);
  totals.samples++;
  totals.rssPeakBytes = Math.max(totals.rssPeakBytes, delta.rssBytes);
  if (!previous) return;
  const seconds = (next.at - previous.at) / 1000;
  if (seconds <= 0) return;
  totals.intervals++;
  totals.seconds += seconds;
  totals.treeCpuSeconds += delta.treeCpuSeconds;
  totals.externalCpuSeconds += delta.externalCpuSeconds;
  totals.maxTreeCpuCores = Math.max(totals.maxTreeCpuCores, delta.treeCpuSeconds / seconds);
  totals.maxExternalCpuCores = Math.max(
    totals.maxExternalCpuCores,
    delta.externalCpuSeconds / seconds,
  );
}

function report(totals: Totals, error: string | null) {
  let status = 'available';
  if (totals.failedSamples) status = 'partial';
  if (!totals.samples) status = 'unavailable';
  return {
    status,
    error,
    ...totals,
    rssPeakBytes: totals.samples ? totals.rssPeakBytes : null,
    meanTreeCpuCores: totals.seconds ? totals.treeCpuSeconds / totals.seconds : null,
    meanExternalCpuCores: totals.seconds ? totals.externalCpuSeconds / totals.seconds : null,
    maxTreeCpuCores: totals.intervals ? totals.maxTreeCpuCores : null,
    maxExternalCpuCores: totals.intervals ? totals.maxExternalCpuCores : null,
    scope,
  };
}
