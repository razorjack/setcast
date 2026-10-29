import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { cpus, totalmem } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import {
  exportSettings,
  framesWithinMix,
  resolveFrameRange,
  toSeconds,
  type RenderRuntime,
} from '@setcast/core';
import { loadProject, probeAudio, readsWholeSet, readWholeSet } from '@setcast/core/node';
import { themes } from '../../themes/src/index.ts';
import { measureLoad, verifyVideo } from '../../../scripts/render-compare/measure.ts';
import { measureProcesses } from '../../../scripts/render-compare/process-monitor.ts';
import { digest, digestFile, projectAssets } from '../src/export/identity.ts';
import { render } from '../src/export/index.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    at: { type: 'string', default: '90' },
    seconds: { type: 'string', default: '10' },
    repeat: { type: 'string', default: '3' },
    workers: { type: 'string', default: '1,2,4' },
    theme: { type: 'string' },
    'idle-busy': { type: 'string' },
  },
});
if (!values.out || positionals.length > 1) throw new Error('Pass [PROJECT] --out NEW_DIRECTORY.');
const at = Number(values.at),
  seconds = Number(values.seconds),
  repeat = Number(values.repeat);
const workers = values
  .workers!.split(',')
  .map((value) => (value === 'auto' ? ('auto' as const) : Number(value)));
const idleBusy = values['idle-busy'] === undefined ? 1 : Number(values['idle-busy']);
if (!Number.isFinite(idleBusy) || idleBusy <= 0 || idleBusy > 1)
  throw new Error('--idle-busy must be greater than 0 and at most 1.');
if (!Number.isFinite(at) || at < 0 || !Number.isFinite(seconds) || seconds <= 0)
  throw new Error('Use finite nonnegative --at and positive --seconds.');
if (
  !Number.isSafeInteger(repeat) ||
  repeat < 1 ||
  repeat > 20 ||
  workers.some(
    (count) => count !== 'auto' && (!Number.isSafeInteger(count) || count < 1 || count > 8),
  )
)
  throw new Error('Use --repeat 1..20 and comma-separated --workers 1..8 or auto.');
const projectDir = resolve(positionals[0] ?? 'examples/demo');
const out = resolve(values.out);
await mkdir(out);
const controller = new AbortController();
for (const name of ['SIGINT', 'SIGTERM'] as const)
  process.once(name, () => controller.abort(new Error(`Stopped by ${name}.`)));

async function inputs() {
  const loaded = await loadProject(projectDir, {
    themes,
    theme: values.theme,
    probeDuration: (audio, root) => probeAudio({ audio }, root),
  });
  const project = readsWholeSet(loaded.project)
    ? await readWholeSet(loaded.project, projectDir)
    : loaded.project;
  const assets = [];
  for (const path of projectAssets(project)) {
    const { sha256, bytes } = await digestFile(resolve(projectDir, path), controller.signal);
    assets.push({ path, sha256, bytes });
  }
  return { loaded, project, identity: digest(JSON.stringify({ project, assets })) };
}
const initial = await inputs();
if (at + seconds > toSeconds(initial.project.mix.duration))
  throw new Error('Requested range exceeds the mix. Shorten --seconds or change --at.');
const frameRange = resolveFrameRange(
  [at, at + seconds],
  initial.project.fps,
  framesWithinMix(initial.project.mix.duration, initial.project.fps),
);
const expectedFrames = frameRange[1] - frameRange[0] + 1;
const runs: unknown[] = [];
const report = {
  version: 1,
  config: { projectDir, at, seconds, repeat, workers, idleBusy, theme: values.theme },
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  identity: initial.identity,
  output: { ...initial.loaded.config.output, hardwareAcceleration: 'disable' },
  dimensions: {
    width: initial.project.width,
    height: initial.project.height,
    fps: initial.project.fps,
  },
  expectedFrames,
  dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
  host: { cpu: cpus()[0]?.model, memoryBytes: totalmem() },
  timing:
    'Fresh sessions, render call through browser cleanup. Project loading, identity and full decode excluded. Shared process and OS caches. No matched-upstream claim.',
  runs,
  status: 'running',
  error: null as string | null,
};
const save = () => writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
await save();
try {
  for (let round = 0; round < repeat; round++) {
    const order = [
      ...workers.slice(round % workers.length),
      ...workers.slice(0, round % workers.length),
    ];
    for (const concurrency of order) await run(round, concurrency);
  }
  if ((await inputs()).identity !== initial.identity)
    throw new Error('Inputs changed during scaling comparison.');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = String(error);
  throw error;
} finally {
  await save();
}

async function run(round: number, concurrency: number | 'auto') {
  const current = await inputs();
  if (current.identity !== initial.identity)
    throw new Error('Inputs changed during scaling comparison.');
  await waitForIdle();
  const runtime: RenderRuntime[] = [];
  const file = join(out, `${round}-${concurrency}.mp4`);
  const processes = await measureProcesses(),
    load = measureLoad();
  const started = performance.now();
  try {
    const result = await render(current.project, {
      ...exportSettings(current.loaded.config.output),
      projectDir,
      out: file,
      range: [at, at + seconds],
      concurrency: concurrency === 'auto' ? undefined : concurrency,
      signal: controller.signal,
      hardwareAcceleration: 'disable',
      onRuntime: (event) => runtime.push(event),
    });
    const wallSeconds = (performance.now() - started) / 1000;
    if (result.frames !== expectedFrames)
      throw new Error(`Expected ${expectedFrames} frames, received ${result.frames}.`);
    const observedLoad = load.stop(),
      observedProcesses = await processes.stop();
    const verification = await verifyVideo(
      file,
      { ...current.project, frames: expectedFrames },
      controller.signal,
    );
    runs.push({
      round,
      concurrency,
      wallSeconds,
      runtime,
      load: observedLoad,
      processes: observedProcesses,
      verification,
    });
    await save();
    process.stdout.write(
      `${round + 1}/${repeat}: ${concurrency} workers, ${wallSeconds.toFixed(3)} s\n`,
    );
  } finally {
    load.stop();
    await processes.stop();
  }
}

function cpuCounters() {
  return cpus().reduce(
    (sum, cpu) => ({
      idle: sum.idle + cpu.times.idle,
      total: sum.total + Object.values(cpu.times).reduce((a, b) => a + b, 0),
    }),
    { idle: 0, total: 0 },
  );
}
async function waitForIdle() {
  if (idleBusy === 1) return;
  for (let attempt = 0; attempt < 12; attempt++) {
    const before = cpuCounters();
    await delay(5000, undefined, { signal: controller.signal });
    const after = cpuCounters();
    const busy = 1 - (after.idle - before.idle) / (after.total - before.total);
    process.stdout.write(`Pre-run system CPU busy: ${(busy * 100).toFixed(1)}%\n`);
    if (busy <= idleBusy) return;
  }
  throw new Error(
    'System remained busy for 60 seconds. Retain this report and retry later in a new directory.',
  );
}
