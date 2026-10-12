import { appendFile, mkdir, stat } from 'node:fs/promises';
import { cpus, freemem, release, totalmem } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  renderMedia,
  type RenderMediaOnProgress,
  type RenderMediaOptions,
} from '@remotion/renderer';
import { drawsWholeSet, type ResolvedProject } from '@setcast/core';
import { loadProject, readSetEnvelope } from '@setcast/core/node';
import { themes } from '../../themes/src/index.ts';
import { encodingOptions } from '../src/encoding.ts';
import { graphicsOptions } from '../src/graphics.ts';
import { PACKAGE_ROOT } from '../src/paths.ts';
import { probeAudio } from '../src/probe.ts';
import { resolveFrameRange } from '../src/range.ts';
import { currentSession, withRenderSession } from '../src/session.ts';
import { variants, type Variant } from './variants.ts';

const HELP = `vp run render-bench [project] [--theme name] [--from seconds] [--seconds N]
  [--variant baseline --variant jpeg-92] [--repeat N] [--out directory]

Defaults: examples/demo, 108-114 seconds, baseline and jpeg-92, two runs each.
Variants: ${variants.map(({ name }) => name).join(', ')}
Runs sequentially, shares browser/bundle preparation, and writes MP4s plus results.jsonl.
The project supplies resolution, FPS and encoding settings; each variant changes only its
listed settings. hardware-12m requires a working hardware encoder. scale-75 changes output
dimensions. Rendering times exclude preparation, which is reported separately.
Use a new --out directory for each experiment; MP4 filenames repeat between invocations.`;

function options() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      theme: { type: 'string' },
      from: { type: 'string', default: '108' },
      seconds: { type: 'string', default: '6' },
      variant: { type: 'string', multiple: true },
      repeat: { type: 'string', default: '2' },
      out: { type: 'string', default: 'examples/demo/out/bench' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    process.stdout.write(`${HELP}\n`);
    process.exit(0);
  }
  const from = Number(values.from);
  const seconds = Number(values.seconds);
  const repeat = Number(values.repeat);
  if (!Number.isFinite(from) || from < 0) throw new Error('--from must be nonnegative seconds.');
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('--seconds must be positive.');
  if (!Number.isSafeInteger(repeat) || repeat < 1)
    throw new Error('--repeat must be a positive integer.');
  const selected = (values.variant ?? ['baseline', 'jpeg-92']).map((name) => {
    const variant = variants.find((variant) => variant.name === name);
    if (!variant) throw new Error(`Unknown variant "${name}".\n${HELP}`);
    return variant;
  });
  return {
    projectDir: resolve(positionals[0] ?? 'examples/demo'),
    out: resolve(values.out),
    theme: values.theme,
    from,
    seconds,
    repeat,
    selected,
  };
}

const request = options();
const loaded = await loadProject(request.projectDir, {
  themes,
  theme: request.theme,
  probeDuration: (audio, dir) => probeAudio({ audio }, dir),
});
const project = loaded.project;
if (request.from + request.seconds > project.mix.duration / 1_000_000)
  throw new Error('The benchmark range exceeds the mix. Reduce --from or --seconds.');
if (drawsWholeSet(project))
  project.envelope = await readSetEnvelope(join(request.projectDir, project.audio));
await mkdir(request.out, { recursive: true });
const resultsFile = join(request.out, 'results.jsonl');
await record({
  kind: 'environment',
  date: new Date().toISOString(),
  node: process.version,
  platform: process.platform,
  os: release(),
  cpu: cpus()[0]?.model,
  cpus: cpus().length,
  memoryBytes: totalmem(),
  request,
  theme: project.theme,
  output: loaded.config.output,
});

process.chdir(PACKAGE_ROOT);
const renderDefaults: Partial<RenderMediaOptions> = {
  audioCodec: 'aac',
  ...encodingOptions(loaded.config.output),
  jpegQuality: loaded.config.output.jpegQuality,
  chromiumOptions: graphicsOptions(loaded.config.output.gl),
};
await withRenderSession(async () => {
  for (let repeat = 0; repeat < request.repeat; repeat++) {
    const order = repeat % 2 === 0 ? request.selected : [...request.selected].reverse();
    for (const variant of order) await measure({ ...project, ...variant.project }, variant, repeat);
  }
});

async function measure(project: ResolvedProject, variant: Variant, repeat: number) {
  const start = performance.now();
  const { gl } = loaded.config.output;
  const resources = await currentSession().prepare(
    project,
    { projectDir: request.projectDir, gl },
    () => {},
  );
  const preparationSeconds = (performance.now() - start) / 1000;
  const { fps, durationInFrames } = resources.composition;
  const frameRange = resolveFrameRange(
    [request.from, request.from + request.seconds],
    fps,
    durationInFrames,
  );
  const frames = frameRange[1] - frameRange[0] + 1;
  const progress = progressClock(frames);
  let startInfo: unknown;
  const outputLocation = join(request.out, `${variant.name}-${repeat + 1}.mp4`);
  const renderOptions: RenderMediaOptions = {
    ...renderDefaults,
    ...resources,
    inputProps: project,
    codec: 'h264',
    outputLocation,
    frameRange,
    ...variant.render,
    onStart: (info) => {
      startInfo = info;
    },
    onProgress: progress.onProgress,
  };
  const freeMemoryBytes = freemem();
  const rendered = await renderMedia(renderOptions);
  await record({
    kind: 'render',
    variant: variant.name,
    repeat: repeat + 1,
    frames,
    fps,
    preparationSeconds,
    elapsedSeconds: progress.seconds(),
    frameMilestones: progress.milestones,
    freeMemoryBytes,
    startInfo,
    bytes: (await stat(outputLocation)).size,
    outputLocation,
    slowestFrames: rendered.slowestFrames,
  });
}

function progressClock(frames: number) {
  const start = performance.now();
  const seconds = () => (performance.now() - start) / 1000;
  const milestones: { fraction: number; seconds: number; encodedFrames: number }[] = [];
  const onProgress: RenderMediaOnProgress = ({ renderedFrames, encodedFrames }) => {
    for (const fraction of [0.2, 0.8, 1]) {
      if (renderedFrames < Math.ceil(frames * fraction)) continue;
      if (milestones.some((entry) => entry.fraction === fraction)) continue;
      milestones.push({ fraction, seconds: seconds(), encodedFrames });
    }
  };
  return { seconds, milestones, onProgress };
}

async function record(entry: unknown) {
  const line = `${JSON.stringify(entry)}\n`;
  process.stdout.write(line);
  await appendFile(resultsFile, line);
}
