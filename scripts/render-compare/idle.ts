import { cpus } from 'node:os';
import { setTimeout } from 'node:timers/promises';

/** A pre-run check only; reports must also retain load observed during the actual export. */
export async function waitForIdle(limit: number, signal?: AbortSignal) {
  if (!Number.isFinite(limit) || limit <= 0 || limit > 1)
    throw new Error('The idle CPU busy limit must be greater than zero and at most one.');
  if (limit === 1) return;
  for (let attempt = 0; attempt < 12; attempt++) {
    const before = counters();
    await setTimeout(5000, undefined, { signal });
    const after = counters();
    const busy = 1 - (after.idle - before.idle) / (after.total - before.total);
    process.stdout.write(`Pre-run system CPU busy: ${(busy * 100).toFixed(1)}%\n`);
    if (busy <= limit) return;
  }
  throw new Error(
    'System remained busy for 60 seconds. Retain this report and retry later in a new directory.',
  );
}

function counters() {
  return cpus().reduce(
    (sum, cpu) => ({
      idle: sum.idle + cpu.times.idle,
      total: sum.total + Object.values(cpu.times).reduce((a, b) => a + b, 0),
    }),
    { idle: 0, total: 0 },
  );
}
