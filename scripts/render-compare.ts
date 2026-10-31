import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { execFileSync } from 'node:child_process';
import { cpus, release } from 'node:os';
import {
  type RenderReport,
  type RenderRuntime,
  type RenderOptions,
  type RuntimeReport,
  exportSettings,
  framesWithinMix,
  resolveFrameRange,
  toSeconds,
} from '../packages/core/src/index.ts';
import { load, withWholeSet } from '../packages/cli/src/project.ts';
import { render, withRenderSession, type Renderer } from '../packages/cli/src/renderer.ts';
import {
  digest,
  digestFile,
  projectAssets,
} from '../packages/renderer-browser/src/export/identity.ts';
import { measureLoad, verifyVideo, summarize } from './render-compare/measure.ts';
import { measureProcesses } from './render-compare/process-monitor.ts';
import { waitForIdle } from './render-compare/idle.ts';
import { projectContent } from './render-compare/content.ts';

const controller = new AbortController();
const HELP = `vp run render-compare [project] --out NEW_DIRECTORY
  [--at 30] [--seconds 6] [--repeat 3] [--concurrency 2] [--theme NAME]
  [--browser-concurrency auto|N] [--remotion-concurrency auto|N] [--idle-busy 0.15]
  [--browser-crf N] [--remotion-crf N] [--browser-jpeg-quality N] [--remotion-jpeg-quality N]
Compare installed Setcast adapters sequentially with alternating order and fresh render sessions.
Project encoding settings are preserved unless explicitly overridden; CRF overrides clear bitrate.
Hardware encoding must be disabled for both arms. Quality measurement is a separate command.
Timings include loading, whole-set analysis, browser/bundle setup, rendering and session cleanup.
Input hashing and decoded-video verification are outside the measured interval.
This is not a current-upstream benchmark or a matched-perceptual-quality claim.
System CPU samples include this job and other projects; do not attribute differences without review.`;

const flags = {
  out: { type: 'string' },
  at: { type: 'string', default: '30' },
  seconds: { type: 'string', default: '6' },
  repeat: { type: 'string', default: '3' },
  concurrency: { type: 'string', default: '2' },
  theme: { type: 'string' },
  help: { type: 'boolean' },
  'idle-busy': { type: 'string', default: '1' },
  'browser-concurrency': { type: 'string' },
  'remotion-concurrency': { type: 'string' },
  'browser-crf': { type: 'string' },
  'remotion-crf': { type: 'string' },
  'browser-jpeg-quality': { type: 'string' },
  'remotion-jpeg-quality': { type: 'string' },
} as const;

function options() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: flags });
  if (values.help) {
    process.stdout.write(`${HELP}\n`);
    process.exit(0);
  }
  const at = Number(values.at),
    seconds = Number(values.seconds);
  const repeat = integerFlag(values.repeat, 'repeat', 1, 100),
    concurrency = integerFlag(values.concurrency, 'concurrency', 1, 8);
  if (!values.out || positionals.length > 1)
    throw new Error(`Specify --out NEW_DIRECTORY and at most one project.\n${HELP}`);
  if (!Number.isFinite(at) || at < 0 || !Number.isFinite(seconds) || seconds <= 0)
    throw new Error('--at must be nonnegative and --seconds positive finite seconds.');
  const idleBusy = Number(values['idle-busy']);
  if (!Number.isFinite(idleBusy) || idleBusy <= 0 || idleBusy > 1)
    throw new Error('--idle-busy must be greater than zero and at most one.');
  return {
    project: resolve(positionals[0] ?? 'examples/demo'),
    out: resolve(values.out),
    at,
    seconds,
    repeat,
    concurrency,
    theme: values.theme,
    idleBusy,
    overrides: {
      browser: adapterOverrides('browser', values, concurrency),
      remotion: adapterOverrides('remotion', values, concurrency),
    },
  };
}

function adapterOverrides(
  name: Renderer,
  values: Record<string, string | boolean | undefined>,
  concurrency: number,
) {
  const result: Pick<RenderOptions, 'concurrency' | 'crf' | 'videoBitrate' | 'jpegQuality'> = {
    concurrency,
  };
  const workerFlag = `${name}-concurrency`,
    crfFlag = `${name}-crf`,
    jpegFlag = `${name}-jpeg-quality`;
  if (values[workerFlag] !== undefined)
    result.concurrency =
      values[workerFlag] === 'auto' ? undefined : integerFlag(values[workerFlag], workerFlag, 1, 8);
  if (values[crfFlag] !== undefined) {
    result.crf = integerFlag(values[crfFlag], crfFlag, 1, 51);
    result.videoBitrate = undefined;
  }
  if (values[jpegFlag] !== undefined)
    result.jpegQuality = integerFlag(values[jpegFlag], jpegFlag, 1, 100);
  return result;
}

function integerFlag(value: unknown, name: string, min: number, max: number) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max)
    throw new Error(`--${name} must be an integer from ${min} to ${max}.`);
  return number;
}

async function inputs(config: ReturnType<typeof options>) {
  const dependencies = new Set<string>();
  const loaded = await load(config.project, config.theme, dependencies);
  if (config.at + config.seconds > toSeconds(loaded.project.mix.duration))
    throw new Error('Requested range exceeds the mix duration. Shorten --seconds or change --at.');
  if (loaded.config.output.hardwareAcceleration !== 'disable')
    throw new Error(
      'Comparison requires output.hardwareAcceleration: disable; this runner compares software encoding.',
    );
  if (!loaded.config.output.parallelEncoding)
    throw new Error('Comparison requires output.parallelEncoding: true for browser export.');
  const paths = new Set([
    ...dependencies,
    ...projectAssets(loaded.project).map((path) => resolve(loaded.dir, path)),
  ]);
  const assets = [];
  for (const path of [...paths].sort())
    assets.push({ path, ...(await digestFile(path, controller.signal)) });
  const range = resolveFrameRange(
    [config.at, config.at + config.seconds],
    loaded.project.fps,
    framesWithinMix(loaded.project.mix.duration, loaded.project.fps),
  );
  return {
    frames: range[1] - range[0] + 1,
    projectHash: digest(JSON.stringify(loaded.project)),
    assets,
    output: loaded.config.output,
    width: loaded.project.width,
    height: loaded.project.height,
    fps: loaded.project.fps,
  };
}

async function runArm(
  config: ReturnType<typeof options>,
  renderer: Renderer,
  index: number,
  expectedFrames: number,
) {
  const file = join(config.out, `${index}-${renderer}.mp4`);
  const processMonitoring = await measureProcesses();
  const monitoring = measureLoad();
  const started = performance.now();
  let firstFrameProgressSeconds: number | null = null;
  const runtime: RenderRuntime[] = [];
  try {
    const { project, result, settings } = await exportArm(config, renderer, file, {
      onProgress: (progress) => {
        if (firstFrameProgressSeconds === null && (progress.renderedFrames ?? 0) > 0)
          firstFrameProgressSeconds = (performance.now() - started) / 1000;
      },
      onRuntime: (event) => runtime.push(event),
    });
    const wallSeconds = (performance.now() - started) / 1000;
    const observedLoad = monitoring.stop();
    const processes = await processMonitoring.stop();
    if (result.frames !== expectedFrames)
      throw new Error(`Renderer returned ${result.frames} frames; expected ${expectedFrames}.`);
    const verification = await verifyVideo(
      file,
      { ...project, frames: expectedFrames },
      controller.signal,
    );
    return {
      renderer,
      index,
      status: 'passed' as const,
      wallSeconds,
      firstFrameProgressSeconds,
      result,
      settings,
      load: observedLoad,
      processes,
      verification,
      ...(await projectContent(project, config.project, controller.signal)),
      outputDigest: (await digestFile(file, controller.signal)).sha256,
      runtime,
    };
  } finally {
    monitoring.stop();
    await processMonitoring.stop();
  }
}

async function exportArm(
  config: ReturnType<typeof options>,
  renderer: Renderer,
  file: string,
  observers: { onProgress: RenderReport; onRuntime: RuntimeReport },
) {
  const loaded = await load(config.project, config.theme);
  const project = await withWholeSet(loaded);
  const settings = { ...exportSettings(loaded.config.output), ...config.overrides[renderer] };
  const result = await withRenderSession(
    () =>
      render(project, {
        ...settings,
        projectDir: loaded.dir,
        out: file,
        signal: controller.signal,
        range: [config.at, config.at + config.seconds],
        ...observers,
      }),
    renderer,
  );
  return { project, result, settings };
}

async function main() {
  const config = options();
  const identity = await inputs(config);
  await mkdir(resolve(config.out, '..'), { recursive: true });
  await mkdir(config.out);
  const runs: Awaited<ReturnType<typeof runArm>>[] = [];
  const report = {
    version: 4,
    config,
    identity,
    startedAt: new Date().toISOString(),
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
    environment: {
      node: process.version,
      platform: process.platform,
      os: release(),
      cpu: cpus()[0]?.model,
    },
    runtimePins: await runtimePins(),
    runtimeObservation:
      'Per-run browser user agent, WebGL identity, capture workers and encoder decisions. Optional observation overhead is included in wall time.',
    timing:
      'Fresh sessions, shared process and OS caches. Includes loading through cleanup; excludes identity and verification.',
    runs,
    status: 'running',
    error: null as string | null,
    summary: {},
  };
  const save = () => saveReport(config.out, report);
  await save();
  try {
    await compare(config, identity, runs, save);
    report.summary = summarize(runs);
    report.status = 'passed';
  } catch (error) {
    report.status = controller.signal.aborted ? 'cancelled' : 'failed';
    report.error = String(error);
    throw error;
  } finally {
    await save();
  }
  process.stdout.write(
    `${JSON.stringify(report.summary, null, 2)}\nReport: ${join(config.out, 'report.json')}\n`,
  );
}

async function compare(
  config: ReturnType<typeof options>,
  identity: Awaited<ReturnType<typeof inputs>>,
  runs: Awaited<ReturnType<typeof runArm>>[],
  save: () => Promise<void>,
) {
  for (let index = 0; index < config.repeat; index++) {
    const order: Renderer[] = index % 2 ? ['remotion', 'browser'] : ['browser', 'remotion'];
    for (const renderer of order) {
      await waitForIdle(config.idleBusy, controller.signal);
      if (JSON.stringify(await inputs(config)) !== JSON.stringify(identity))
        throw new Error(
          'Project inputs changed during comparison. Start a new comparison with stable inputs.',
        );
      process.stdout.write(`Pair ${index + 1}/${config.repeat}: ${renderer}\n`);
      controller.signal.throwIfAborted();
      try {
        runs.push(await runArm(config, renderer, index, identity.frames));
      } catch (cause) {
        throw new Error(`Pair ${index + 1}, ${renderer}: ${String(cause)}`, { cause });
      }
      await save();
    }
  }
  if (JSON.stringify(await inputs(config)) !== JSON.stringify(identity))
    throw new Error('Project inputs changed during comparison. Results are not comparable.');
}

async function saveReport(out: string, report: unknown) {
  const file = join(out, 'report.json');
  await writeFile(`${file}.tmp`, `${JSON.stringify(report, null, 2)}\n`);
  await rename(`${file}.tmp`, file);
}

async function runtimePins() {
  const pins: Record<string, string> = {};
  for (const [adapter, dependency] of [
    ['renderer-browser', 'playwright'],
    ['renderer-remotion', '@remotion/renderer'],
    ['renderer-browser', 'mediabunny'],
  ] as const) {
    const file = resolve('packages', adapter, 'node_modules', dependency, 'package.json');
    pins[dependency] = JSON.parse(await readFile(file, 'utf8')).version;
  }
  return pins;
}

const stop = () =>
  controller.abort(new Error('Comparison interrupted. Completed runs remain in report.json.'));
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
try {
  await main();
} finally {
  process.off('SIGINT', stop);
  process.off('SIGTERM', stop);
}
