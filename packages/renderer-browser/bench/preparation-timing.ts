import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { cpus } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { resolveVisualizerConfigs } from '@setcast/core';
import { loadProject, probeAudio, readWholeSet } from '@setcast/core/node';
import { themes } from '../../themes/src/index.ts';
import { prepareProject, inspectRenderCache } from '../src/export/index.ts';
import { canonical, digest, digestFile } from '../src/export/identity.ts';
import { encoderVersion } from '../src/export/probe.ts';
import { measureLoad } from '../../../scripts/render-compare/measure.ts';
import { measureProcesses } from '../../../scripts/render-compare/process-monitor.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { out: { type: 'string' } },
});
if (!values.out || positionals.length !== 1) throw new Error('Pass PROJECT --out NEW_DIRECTORY.');
const projectDir = resolve(positionals[0]!);
const out = resolve(values.out);
await mkdir(out);
const loaded = await loadProject(projectDir, {
  themes,
  probeDuration: (audio, root) => probeAudio({ audio }, root),
});
const project = {
  ...loaded.project,
  visualizers: resolveVisualizerConfigs({ name: 'overview' }),
  css: loaded.project.css + '\n.setcast { --preparation-check: var(--travel-bass); }',
};
const cache = { directory: join(out, 'cache'), maxBytes: 32 * 1024 * 1024 };
const source = await digestFile(join(projectDir, project.audio));
const expected = await readWholeSet(project, projectDir);
assert.deepEqual(await prepareProject(project, { projectDir, cache }), expected);
const report = {
  version: 1,
  status: 'running',
  error: null as string | null,
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
  projectDir,
  source,
  decoder: await encoderVersion(),
  preparedHash: digest(canonical({ envelope: expected.envelope, travel: expected.travel })),
  scope:
    'Three alternating warm preparation pairs, 15% pre-run CPU limit. Includes source hashing and cache validation for reuse. Excludes project loading, browser capture, encoding and CLI startup. Same process and warm filesystem; not end-to-end export speed.',
  runs: [] as unknown[],
  cache: null as unknown,
};
const save = () => writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
try {
  for (let round = 0; round < 3; round++) {
    const order = round % 2 === 0 ? ['computed', 'cached'] : ['cached', 'computed'];
    for (const mode of order) await measure(round, mode);
  }
  assert.equal((await digestFile(join(projectDir, project.audio))).sha256, source.sha256);
  report.cache = await inspectRenderCache(cache.directory);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = String(error);
  throw error;
} finally {
  await save();
}

async function measure(round: number, mode: string) {
  await waitForIdle();
  const processes = await measureProcesses(),
    load = measureLoad();
  const started = performance.now();
  let reused = false;
  try {
    const prepared =
      mode === 'computed'
        ? await readWholeSet(project, projectDir)
        : await prepareProject(project, {
            projectDir,
            cache,
            onPreparation: (status) => {
              reused = status === 'reused';
            },
          });
    const seconds = (performance.now() - started) / 1000;
    const observedLoad = load.stop(),
      observedProcesses = await processes.stop();
    assert.deepEqual(prepared, expected);
    assert.equal(reused, mode === 'cached');
    report.runs.push({
      round,
      mode,
      seconds,
      reused,
      exact: true,
      load: observedLoad,
      processes: observedProcesses,
    });
    await save();
    process.stdout.write(`${round + 1}/3 ${mode}: ${seconds.toFixed(3)} s\n`);
  } finally {
    load.stop();
    await processes.stop();
  }
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
async function waitForIdle() {
  for (let attempt = 0; attempt < 12; attempt++) {
    const before = counters();
    await delay(5000);
    const after = counters();
    const busy = 1 - (after.idle - before.idle) / (after.total - before.total);
    process.stdout.write(`Pre-run CPU busy: ${(100 * busy).toFixed(1)}%\n`);
    if (busy <= 0.15) return;
  }
  throw new Error(
    'System remained busy for 60 seconds. Retain the report and retry in a new directory.',
  );
}
