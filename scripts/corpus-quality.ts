import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, statfs, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { digestFile } from '../packages/renderer-browser/src/export/identity.ts';

const { values } = parseArgs({
  options: {
    manifest: { type: 'string' },
    upstream: { type: 'string' },
    out: { type: 'string' },
    case: { type: 'string' },
    'discard-reference': { type: 'boolean', default: false },
  },
});
if (!values.manifest || !values.upstream || !values.out)
  throw new Error(
    'Pass --manifest FILE --upstream CHECKOUT --out NEW_DIRECTORY [--case NAME] [--discard-reference].',
  );
const root = process.cwd(),
  upstream = resolve(values.upstream),
  out = resolve(values.out);
const manifest = JSON.parse(await readFile(values.manifest, 'utf8')) as {
  version: number;
  cases: CorpusCase[];
};
interface CorpusCase {
  name: string;
  directory: string;
  at: number;
  seconds: number;
  projectDigest: string;
  assetsDigest: string;
  config: { output: { width: number; height: number; fps: number } };
}
assert.equal(manifest.version, 1);
const cases = manifest.cases.filter((fixture) => !values.case || fixture.name === values.case);
assert(cases.length > 0, 'The requested case is absent from the manifest');
const execute = promisify(execFile);
const control = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => control.abort(new Error(`Stopped by ${signal}`)));
await mkdir(out);
const report = {
  version: 1,
  scope:
    'Output quality only. Export timings ran without an idle requirement and are not performance evidence.',
  manifest: resolve(values.manifest),
  upstream,
  status: 'running',
  error: null as string | null,
  results: [] as unknown[],
  discardReference: values['discard-reference'],
};
const save = () => writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
try {
  for (const fixture of cases) {
    process.stdout.write(`Quality corpus: ${fixture.name}\n`);
    report.results.push(await measureCase(fixture));
    await save();
  }
  report.status = 'measured';
} catch (error) {
  report.status = 'failed';
  report.error = String(error);
  throw error;
} finally {
  await save();
}

async function measureCase(fixture: CorpusCase) {
  const directory = join(out, fixture.name);
  await mkdir(directory);
  await checkSpace(fixture);
  const authored = JSON.parse(await readFile(join(fixture.directory, 'setcast.yaml'), 'utf8'));
  assert.deepEqual(authored, fixture.config, 'Corpus configuration changed after freezing');
  const reference = join(directory, 'reference');
  await captureReference(fixture, directory, reference);
  const referenceManifest = JSON.parse(await readFile(join(reference, 'reference.json'), 'utf8'));
  assert.equal(referenceManifest.projectDigest, fixture.projectDigest, 'Corpus project changed');
  assert.equal(referenceManifest.assetsDigest, fixture.assetsDigest, 'Corpus assets changed');
  const comparison = join(directory, 'comparison');
  await captureComparison(fixture, directory, reference, comparison);
  const metrics = await compareMetrics(directory);
  const samples = await retainReferenceSamples(reference, referenceManifest.frames);
  if (values['discard-reference']) await unlink(join(reference, 'reference.mkv'));
  return { name: fixture.name, directory, metrics, samples };
}

async function captureReference(fixture: CorpusCase, directory: string, reference: string) {
  await command(
    process.execPath,
    [
      'packages/renderer-browser/bench/quality-reference.ts',
      fixture.directory,
      '--at',
      String(fixture.at),
      '--seconds',
      String(fixture.seconds),
      '--out',
      reference,
    ],
    join(directory, 'reference.log'),
  );
}

async function captureComparison(
  fixture: CorpusCase,
  directory: string,
  reference: string,
  comparison: string,
) {
  await command(
    process.execPath,
    [
      'scripts/render-compare.ts',
      fixture.directory,
      '--out',
      comparison,
      '--at',
      String(fixture.at),
      '--seconds',
      String(fixture.seconds),
      '--repeat',
      '1',
      '--concurrency',
      '1',
      '--browser-jpeg-quality',
      '100',
      '--browser-crf',
      '16',
    ],
    join(directory, 'comparison.log'),
    upstream,
  );
  for (const adapter of ['browser', 'remotion']) {
    await command(
      process.execPath,
      [
        'scripts/render-quality.ts',
        '--reference',
        join(reference, 'reference.json'),
        '--comparison',
        join(comparison, 'report.json'),
        '--video',
        join(comparison, `0-${adapter}.mp4`),
        '--out',
        join(directory, adapter),
      ],
      join(directory, `${adapter}.log`),
    );
  }
}

async function checkSpace(fixture: CorpusCase) {
  const { width, height, fps } = fixture.config.output;
  const frames = Math.ceil(fixture.seconds * fps);
  const required = width * height * 3 * frames * 1.1 + 1024 ** 3;
  const space = await statfs(out);
  assert(
    space.bavail * space.bsize >= required,
    `Need ${(required / 1024 ** 3).toFixed(1)} GiB free for conservative uncompressed reference capacity; free space or run this case on a larger volume.`,
  );
}

async function command(file: string, args: string[], log: string, cwd = root) {
  try {
    const result = await execute(file, args, {
      cwd,
      maxBuffer: 16 * 1024 * 1024,
      signal: control.signal,
    });
    await writeFile(log, result.stdout + result.stderr);
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    await writeFile(log, (failure.stdout ?? '') + (failure.stderr ?? '') + String(error));
    throw error;
  }
}

async function retainReferenceSamples(reference: string, frames: number) {
  const indices = [0, Math.floor(frames / 2), frames - 1];
  const select = indices.map((frame) => `eq(n\\,${frame})`).join('+');
  await command(
    'ffmpeg',
    [
      '-v',
      'error',
      '-i',
      join(reference, 'reference.mkv'),
      '-vf',
      `select=${select}`,
      '-fps_mode',
      'vfr',
      '-frames:v',
      '3',
      join(reference, 'sample-%02d.png'),
    ],
    join(reference, 'samples.log'),
  );
  const files = (await readdir(reference)).filter((name) => /^sample-\d+.png$/.test(name)).sort();
  assert.equal(files.length, 3);
  const samples = [];
  for (const [index, name] of files.entries())
    samples.push({
      frameOffset: indices[index],
      file: name,
      ...(await digestFile(join(reference, name), control.signal)),
    });
  return samples;
}

interface MetricReport {
  status: string;
  regions: Record<string, { psnr: Scores; ssim: Scores }>;
  vmaf: { percentiles: Scores };
  videoDigest: { bytes: number };
}
type Scores = Record<'min' | 'p05' | 'mean', number | 'infinity'>;
async function compareMetrics(directory: string) {
  const browser: MetricReport = JSON.parse(
    await readFile(join(directory, 'browser/report.json'), 'utf8'),
  );
  const remotion: MetricReport = JSON.parse(
    await readFile(join(directory, 'remotion/report.json'), 'utf8'),
  );
  assert.equal(browser.status, 'measured');
  assert.equal(remotion.status, 'measured');
  assert.deepEqual(Object.keys(browser.regions), Object.keys(remotion.regions));
  const checks = [];
  for (const [region, scores] of Object.entries(browser.regions)) {
    for (const metric of ['psnr', 'ssim'] as const)
      checks.push(
        ...scoreChecks(region, metric, scores[metric], remotion.regions[region]![metric]),
      );
  }
  checks.push(
    ...scoreChecks('full', 'vmafNeg', browser.vmaf.percentiles, remotion.vmaf.percentiles),
  );
  return {
    scope:
      'Numerical comparisons only; inspect samples and temporal correctness before qualification.',
    browserBytes: browser.videoDigest.bytes,
    remotionBytes: remotion.videoDigest.bytes,
    allAtLeastReference: checks.every((check) => check.atLeastReference),
    checks,
  };
}

function scoreChecks(region: string, metric: string, browser: Scores, remotion: Scores) {
  return (['min', 'p05', 'mean'] as const).map((stat) => {
    const b = browser[stat] === 'infinity' ? Infinity : browser[stat];
    const r = remotion[stat] === 'infinity' ? Infinity : remotion[stat];
    return {
      region,
      metric,
      stat,
      browser: browser[stat],
      remotion: remotion[stat],
      atLeastReference: b >= r,
    };
  });
}
