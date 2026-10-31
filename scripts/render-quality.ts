import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { digestFile } from '../packages/renderer-browser/src/export/identity.ts';
import { resolveFrameRange } from '../packages/core/src/index.ts';

const execute = promisify(execFile);
const control = new AbortController();
for (const name of ['SIGINT', 'SIGTERM'] as const)
  process.once(name, () => control.abort(new Error(`Stopped by ${name}.`)));
const { values } = parseArgs({
  options: {
    reference: { type: 'string' },
    video: { type: 'string' },
    out: { type: 'string' },
    comparison: { type: 'string' },
  },
});
if (!values.reference || !values.video || !values.out)
  throw new Error(
    'Pass --reference reference.json --video ENCODED_VIDEO --out NEW_DIRECTORY [--comparison report.json].',
  );
const manifestFile = resolve(values.reference),
  video = resolve(values.video),
  out = resolve(values.out);
const reference = JSON.parse(await readFile(manifestFile, 'utf8')) as {
  version: number;
  frames: number;
  width: number;
  height: number;
  fps: number;
  range: [number, number];
  fileDigest: { sha256: string };
  projectDigest: string;
  assetsDigest: string;
  regions: Record<string, { x: number; y: number; right: number; bottom: number }>;
};
assert.equal(reference.version, 1);
const lossless = join(dirname(manifestFile), 'reference.mkv');
assert.equal(
  (await digestFile(lossless, control.signal)).sha256,
  reference.fileDigest.sha256,
  'Reference changed after qualification',
);
await mkdir(out);
const [referenceStream, videoStream] = await Promise.all([probe(lossless), probe(video)]);
for (const stream of [referenceStream, videoStream]) {
  assert.equal(stream.width, reference.width);
  assert.equal(stream.height, reference.height);
  assert.equal(Number(stream.nb_read_frames), reference.frames);
  const [n, d] = String(stream.avg_frame_rate).split('/').map(Number);
  assert.equal(n! / d!, reference.fps, 'Frame rates must match before frame-index comparison');
}
const report = {
  version: 1,
  video,
  reference: manifestFile,
  referenceStream,
  videoStream,
  videoDigest: await digestFile(video, control.signal),
  projectVerification: 'not supplied',
  ffmpeg: (await execute('ffmpeg', ['-version'], { signal: control.signal })).stdout.split('\n')[0],
  scope:
    'Raster fidelity by frame index, using FFmpeg tagged matrix/range conversion to full-range RGB. Missing matrix tags use FFmpeg defaults and remain visible in stream metadata. No transfer-function/display conversion. Not a temporal, audio, subjective-quality or speed qualification.',
  regions: {} as Record<string, unknown>,
  vmaf: null as unknown,
  status: 'running',
  error: null as string | null,
};
const save = () => writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
await save();
try {
  if (values.comparison) {
    const comparison = JSON.parse(await readFile(resolve(values.comparison), 'utf8'));
    assert.equal(
      comparison.version,
      4,
      'Project verification requires comparison report version 4',
    );
    const { at, seconds } = comparison.config;
    assert.deepEqual(
      resolveFrameRange([at, at + seconds], reference.fps, Number.MAX_SAFE_INTEGER),
      reference.range,
      'Reference and export cover different absolute frames',
    );
    const run = comparison.runs.find(
      (run: { result: { file: string } }) => resolve(run.result.file) === video,
    );
    assert(run, 'The comparison report has no run for this video');
    assert.equal(typeof run.projectDigest, 'string');
    assert.equal(
      run.projectDigest,
      reference.projectDigest,
      'Reference and export used different resolved projects',
    );
    assert.equal(typeof run.assetsDigest, 'string');
    assert.equal(
      run.assetsDigest,
      reference.assetsDigest,
      'Reference and export used different asset contents',
    );
    assert.equal(run.outputDigest, report.videoDigest.sha256, 'Video changed after timed export');
    report.projectVerification =
      'matched absolute frames, resolved project, asset contents and exported file';
  }
  const regions = {
    full: { x: 0, y: 0, right: reference.width, bottom: reference.height },
    ...reference.regions,
  };
  for (const [name, rect] of Object.entries(regions)) {
    assert(/^[a-z]+$/.test(name), 'Region names must be lowercase ASCII letters');
    assert([rect.x, rect.y, rect.right, rect.bottom].every(Number.isSafeInteger));
    assert(
      rect.x >= 0 &&
        rect.y >= 0 &&
        rect.right <= reference.width &&
        rect.bottom <= reference.height,
    );
    assert(
      rect.right - rect.x >= 8 && rect.bottom - rect.y >= 8,
      'SSIM regions need at least 8 by 8 pixels',
    );
    report.regions[name] = await metrics(name, rect);
    await save();
  }
  const model =
    reference.width * reference.height >= 3840 * 2160 ? 'vmaf_4k_v0.6.1neg' : 'vmaf_v0.6.1neg';
  const yuv = ',scale=out_color_matrix=bt709:out_range=tv,format=yuv420p';
  await compare(
    `${normalized(0)}${yuv}[d];${normalized(1)}${yuv}[r];[d][r]libvmaf=model=version=${model}:log_fmt=json:log_path=vmaf.json:n_threads=2`,
    [],
  );
  const vmaf = JSON.parse(await readFile(join(out, 'vmaf.json'), 'utf8'));
  assert.equal(vmaf.frames.length, reference.frames, 'VMAF must compare every frame');
  report.vmaf = {
    model,
    pooled: vmaf.pooled_metrics,
    percentiles: summary(
      vmaf.frames.map((frame: { metrics: { vmaf: number } }) => frame.metrics.vmaf),
    ),
  };
  assert.equal(
    (await digestFile(video, control.signal)).sha256,
    report.videoDigest.sha256,
    'Video changed during comparison',
  );
  assert.equal(
    (await digestFile(lossless, control.signal)).sha256,
    reference.fileDigest.sha256,
    'Reference changed during comparison',
  );
  report.status = 'measured';
} catch (error) {
  report.status = control.signal.aborted ? 'cancelled' : 'failed';
  report.error = String(error);
  throw error;
} finally {
  await save();
}
process.stdout.write(`Quality measurements: ${join(out, 'report.json')}\n`);

async function probe(file: string) {
  return JSON.parse(
    (
      await execute(
        'ffprobe',
        [
          '-v',
          'error',
          '-select_streams',
          'v:0',
          '-count_frames',
          '-show_streams',
          '-of',
          'json',
          file,
        ],
        { signal: control.signal },
      )
    ).stdout,
  ).streams[0];
}

function normalized(index: number) {
  return `[${index}:v]settb=1/${reference.fps},setpts=N,scale=in_range=auto:out_range=full,format=gbrp`;
}

async function compare(filter: string, maps: string[]) {
  const result = await execute(
    'ffmpeg',
    [
      '-hide_banner',
      '-v',
      'error',
      '-xerror',
      '-threads',
      '2',
      '-i',
      video,
      '-threads',
      '2',
      '-i',
      lossless,
      '-filter_complex_threads',
      '2',
      '-filter_complex',
      filter,
      ...maps.flatMap((map) => ['-map', map]),
      '-an',
      '-f',
      'null',
      '-',
    ],
    { cwd: out, maxBuffer: 1024 * 1024, signal: control.signal },
  );
  assert.equal(result.stderr.trim(), '', 'FFmpeg reported a conversion problem');
}

async function metrics(
  name: string,
  rect: { x: number; y: number; right: number; bottom: number },
) {
  const crop = `,crop=${rect.right - rect.x}:${rect.bottom - rect.y}:${rect.x}:${rect.y}`;
  const filter = `${normalized(0)}${crop},split[d1][d2];${normalized(1)}${crop},split[r1][r2];[d1][r1]psnr=stats_file=${name}-psnr.txt:stats_version=2[p];[d2][r2]ssim=stats_file=${name}-ssim.txt[s]`;
  await compare(filter, ['[p]', '[s]']);
  const psnr = await samples(`${name}-psnr.txt`, 'psnr_avg');
  const ssim = await samples(`${name}-ssim.txt`, 'All');
  return { rect, psnr: summary(psnr), ssim: summary(ssim) };
}

async function samples(file: string, key: string) {
  const values = [
    ...(await readFile(join(out, file), 'utf8')).matchAll(
      new RegExp(`(?:^| )${key}:([0-9.e+-]+|inf)`, 'gm'),
    ),
  ].map((match) => (match[1] === 'inf' ? Infinity : Number(match[1])));
  assert.equal(values.length, reference.frames, `${file}: every frame must have a score`);
  assert(values.every((value) => !Number.isNaN(value)));
  return values;
}

function summary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const finite = (value: number) => (Number.isFinite(value) ? value : 'infinity');
  return {
    frames: values.length,
    min: finite(sorted[0]!),
    p05: finite(sorted[Math.floor((sorted.length - 1) * 0.05)]!),
    median: finite(sorted[Math.floor((sorted.length - 1) * 0.5)]!),
    mean: finite(values.reduce((sum, value) => sum + value, 0) / values.length),
  };
}
