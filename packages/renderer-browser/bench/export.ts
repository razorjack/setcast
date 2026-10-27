import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { load, withWholeSet } from '../../cli/src/project.ts';
import { render, type BrowserMetric } from '../src/export/index.ts';
import { toSeconds } from '@setcast/core';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    seconds: { type: 'string', default: '6' },
    at: { type: 'string', default: '30' },
    concurrency: { type: 'string', default: '2' },
    out: { type: 'string', default: 'examples/demo/out/browser-profile' },
  },
});
const seconds = Number(values.seconds);
const at = Number(values.at);
const concurrency = Number(values.concurrency);
if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(at) || at < 0)
  throw new Error('Use a positive --seconds and nonnegative --at in seconds.');
const loaded = await load(positionals[0] ?? 'examples/demo');
const project = await withWholeSet(loaded);
const out = resolve(values.out!);
await mkdir(out, { recursive: true });
const stats: Record<string, { count: number; sum: number; max: number }> = {};
function add(name: string, value: number) {
  const stat = (stats[name] ??= { count: 0, sum: 0, max: 0 });
  stat.count++;
  stat.sum += value;
  stat.max = Math.max(stat.max, value);
}
function measured(metric: BrowserMetric) {
  if (metric.kind !== 'frame') {
    add(metric.kind, metric.milliseconds);
    return;
  }
  for (const key of [
    'audioMs',
    'resolveMs',
    'commitMs',
    'readinessMs',
    'captureMs',
    'bytes',
  ] as const)
    add(key, metric[key]);
}
let nodeRssPeak = process.memoryUsage().rss;
const timer = setInterval(() => {
  nodeRssPeak = Math.max(nodeRssPeak, process.memoryUsage().rss);
}, 250);
const started = performance.now();
try {
  const result = await render(project, {
    projectDir: loaded.dir,
    out: join(out, 'profile.mp4'),
    range: [at, Math.min(at + seconds, toSeconds(project.mix.duration))],
    concurrency,
    onMetrics: measured,
  });
  const report = {
    project: loaded.dir,
    width: project.width,
    height: project.height,
    fps: project.fps,
    concurrency,
    result,
    wallSeconds: (performance.now() - started) / 1000,
    nodeRssPeak,
    stats,
  };
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2));
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} finally {
  clearInterval(timer);
}
