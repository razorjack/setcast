import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { themes } from '../../themes/src/index.ts';
import type { ResolvedProject } from '@setcast/core';
import {
  createFixture,
  fixtureProject,
  FIRST_FRAME,
  FRAME_COUNT,
} from '../../../scripts/export-acceptance/fixture.ts';
import {
  render,
  still,
  withRenderSession,
  type BrowserRenderOptions,
} from '../src/export/index.ts';
import { prepareFrame, withCapture } from '../src/export/session.ts';

const { values } = parseArgs({
  options: { out: { type: 'string' }, avfoundation: { type: 'boolean' } },
});
if (!values.out) throw new Error('Pass --out NEW_DIRECTORY for ProRes qualification.');
const root = resolve(values.out);
await mkdir(root);
const fixture = join(root, 'fixture');
await mkdir(fixture);
await createFixture(fixture);
const loaded = await fixtureProject(fixture, 'sterile-tech');
const chart: ResolvedProject = {
  ...loaded,
  transparent: true,
  visualizers: [],
  css: `
.sc-stage { position:relative; background:red !important; }
.sc-stage::after { content:''; position:absolute; inset:0; background:red; }
.sc-stage > :not(style) { display:none; }
.sc-stage > .sc-header { display:block; position:absolute; inset:30px 50px; transform:translateX(calc(var(--set-progress) * 30px));
  background:linear-gradient(to right, #e0602000 0 25%, #e0602040 25% 50%, #e0602080 50% 75%, #e06020 75%); }
.sc-header > * { display:none; }
.sc-header::before { content:'Żółć · straight alpha 0123456789'; position:absolute; top:120px; left:30px; color:#80dfff; font:22px sans-serif; text-shadow:0 0 8px #80dfff; }
.sc-header::after { content:''; position:absolute; bottom:20px; left:20px; width:170px; height:60px; background:#f0f0f0; mask:linear-gradient(to right, transparent, black); }
`,
};
const options: BrowserRenderOptions = {
  projectDir: fixture,
  out: join(root, 'chunked.mov'),
  codec: 'prores-4444',
  concurrency: 1,
  range: [1.05, 8],
  chunkSeconds: 1,
};
const report: Record<string, unknown> = {
  version: 1,
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  dirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
  ffmpeg: execFileSync('ffmpeg', ['-version'], { encoding: 'utf8' }).split('\n')[0],
  thresholds: { compositeMean: 1.5, compositeMax: 12, alphaMax: 1 },
  firstFrame: FIRST_FRAME,
  frames: FRAME_COUNT,
};
try {
  await withRenderSession(async () => {
    const result = await render(chart, {
      ...options,
      onRuntime: (event) => {
        if (event.kind === 'browser') report.browser = event;
      },
    });
    assert.equal(result.frames, FRAME_COUNT);
    const reference = await referencePixels(chart);
    const decoded = videoPixels(options.out);
    report.pixels = comparePixels(reference, decoded);
    await writeFile(join(root, 'reference.rgba'), reference);
    await writeFile(join(root, 'decoded.rgba'), decoded);
    assertPixels(report.pixels as ReturnType<typeof comparePixels>);
    if (values.avfoundation) report.avfoundation = await nativeReceiver(reference);
    report.audio = verifyAudio();
    const continuous = join(root, 'continuous.mov');
    await render(chart, { ...options, out: continuous, chunkSeconds: 0 });
    assert.equal(hash(videoPixels(continuous)), hash(decoded));
    assert.equal(audioHash(continuous), audioHash(options.out));
    report.chunkJoinExact = true;
    report.reuse = await verifyReuse(chart);
    report.themes = await themeStills();
    report.brightness = await brightnessStills();
    report.media = JSON.parse(
      execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', options.out], {
        encoding: 'utf8',
      }),
    );
    report.status = 'passed';
  });
} catch (error) {
  report.status = 'failed';
  report.error = String(error);
  throw error;
} finally {
  await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2));
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

async function referencePixels(project: ResolvedProject) {
  return withCapture(project, options, async (page) => {
    const frames: Buffer[] = [];
    for (let frame = FIRST_FRAME; frame < FIRST_FRAME + FRAME_COUNT; frame++) {
      await prepareFrame(page, frame);
      assert.equal(await page.locator('.sc-bg').count(), 0);
      const png = await page.screenshot({ type: 'png', omitBackground: true });
      if (frame === FIRST_FRAME) await writeFile(join(root, 'reference.png'), png);
      frames.push(
        execFileSync(
          'ffmpeg',
          ['-v', 'error', '-i', 'pipe:0', '-pix_fmt', 'rgba', '-f', 'rawvideo', '-'],
          { input: png, maxBuffer: 2 * 1024 * 1024 },
        ),
      );
    }
    return Buffer.concat(frames);
  });
}

function videoPixels(file: string) {
  return execFileSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-xerror',
      '-i',
      file,
      '-map',
      '0:v:0',
      '-pix_fmt',
      'rgba',
      '-f',
      'rawvideo',
      '-',
    ],
    { maxBuffer: 128 * 1024 * 1024 },
  );
}
function audioHash(file: string) {
  return hash(
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-xerror',
      '-i',
      file,
      '-map',
      '0:a:0',
      '-c:a',
      'pcm_s24le',
      '-f',
      's24le',
      '-',
    ]),
  );
}
function hash(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex');
}

function comparePixels(reference: Buffer, decoded: Buffer) {
  assert.equal(decoded.length, reference.length);
  let alphaMax = 0,
    compositeMax = 0,
    compositeSum = 0,
    transparent = 0,
    partial = 0;
  for (let offset = 0; offset < reference.length; offset += 4) {
    const alpha = reference[offset + 3]! / 255;
    const actualAlpha = decoded[offset + 3]! / 255;
    alphaMax = Math.max(alphaMax, Math.abs(reference[offset + 3]! - decoded[offset + 3]!));
    if (alpha === 0) transparent++;
    else if (alpha < 1) partial++;
    for (const background of [0, 255]) {
      for (let channel = 0; channel < 3; channel++) {
        const expected = reference[offset + channel]! * alpha + background * (1 - alpha);
        const actual = decoded[offset + channel]! * actualAlpha + background * (1 - actualAlpha);
        const difference = Math.abs(expected - actual);
        compositeMax = Math.max(compositeMax, difference);
        compositeSum += difference;
      }
    }
  }
  return {
    alphaMax,
    compositeMax,
    compositeMean: compositeSum / ((reference.length / 4) * 6),
    transparent,
    partial,
    rgbaSha256: hash(decoded),
  };
}
function assertPixels(pixels: ReturnType<typeof comparePixels>) {
  assert(pixels.transparent > 0 && pixels.partial > 0);
  assert(pixels.alphaMax <= 1, `Alpha error ${pixels.alphaMax} exceeds 1.`);
  assert(pixels.compositeMean <= 1.5, `Composite mean ${pixels.compositeMean} exceeds 1.5.`);
  assert(pixels.compositeMax <= 12, `Composite maximum ${pixels.compositeMax} exceeds 12.`);
}

async function nativeReceiver(reference: Buffer) {
  assert.equal(
    process.platform,
    'darwin',
    '--avfoundation requires macOS and Xcode command-line tools.',
  );
  const decoded = join(root, 'avfoundation.bgra');
  const script = fileURLToPath(new URL('./prores-avfoundation.swift', import.meta.url));
  const metadata = JSON.parse(
    execFileSync(
      'xcrun',
      [
        'swift',
        '-module-cache-path',
        join(tmpdir(), 'setcast-swift-module-cache'),
        script,
        options.out,
        decoded,
      ],
      { encoding: 'utf8', timeout: 300_000 },
    ),
  );
  assert.equal(metadata.containsAlpha, true);
  assert.equal(metadata.frames, FRAME_COUNT);
  assert(
    metadata.formatExtensions.some((description: string) => description.includes('StraightAlpha')),
  );
  for (const [index, time] of metadata.timestamps.entries())
    assert(Math.abs(time - index / 30) < 1e-9);
  const rgba = await readFile(decoded);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    const blue = rgba[offset]!;
    rgba[offset] = rgba[offset + 2]!;
    rgba[offset + 2] = blue;
  }
  const pixels = comparePixels(reference, rgba);
  assertPixels(pixels);
  return { metadata, pixels };
}

function verifyAudio() {
  const decoded = execFileSync('ffmpeg', [
    '-v',
    'error',
    '-i',
    options.out,
    '-map',
    '0:a:0',
    '-c:a',
    'pcm_s24le',
    '-f',
    's24le',
    '-',
  ]);
  const expected = execFileSync('ffmpeg', [
    '-v',
    'error',
    '-ss',
    String(FIRST_FRAME / 30),
    '-i',
    join(fixture, 'tone.wav'),
    '-af',
    'apad',
    '-t',
    String(FRAME_COUNT / 30),
    '-ar',
    '48000',
    '-ac',
    '2',
    '-c:a',
    'pcm_s24le',
    '-f',
    's24le',
    '-',
  ]);
  assert.equal(decoded.length, (FRAME_COUNT / 30) * 48000 * 2 * 3);
  assert.equal(hash(decoded), hash(expected));
  return { frames: decoded.length / 6, sourceSliceExact: true, sha256: hash(decoded) };
}

async function brightnessStills() {
  const observations: Record<string, number> = {};
  for (const brightness of [0, 0.5, 1]) {
    const file = join(root, `brightness-${brightness}.png`);
    await still(
      { ...chart, performance: { intensity: 1, brightness } },
      { projectDir: fixture, out: file, at: FIRST_FRAME / 30 },
    );
    const rgba = videoPixels(file);
    let maximumAlpha = 0;
    for (let offset = 3; offset < rgba.length; offset += 4)
      maximumAlpha = Math.max(maximumAlpha, rgba[offset]!);
    assert(Math.abs(maximumAlpha - brightness * 255) <= 1);
    observations[String(brightness)] = maximumAlpha;
  }
  return observations;
}

async function verifyReuse(project: ResolvedProject) {
  const cache = { directory: join(root, 'cache'), maxBytes: 64 * 1024 * 1024 };
  const out = join(root, 'cached.mov');
  await render(project, { ...options, out, cache });
  let captured = 0;
  await render(project, {
    ...options,
    out,
    cache,
    onMetrics: (metric) => {
      if (metric.kind === 'frame') captured++;
    },
  });
  assert.equal(captured, 0);
  assert.equal(hash(videoPixels(out)), hash(videoPixels(options.out)));
  const resumed = join(root, 'resumed.mov');
  const controller = new AbortController();
  await assert.rejects(
    render(project, {
      ...options,
      out: resumed,
      resume: true,
      signal: controller.signal,
      onProgress: (progress) => {
        if ((progress.renderedFrames ?? 0) >= 32)
          controller.abort(new Error('Intentional interruption'));
      },
    }),
  );
  let reused = 0;
  await render(project, {
    ...options,
    out: resumed,
    resume: true,
    onProgress: (progress) => {
      reused = Math.max(reused, progress.reusedFrames ?? 0);
    },
  });
  assert(reused > 0);
  assert.equal(hash(videoPixels(resumed)), hash(videoPixels(options.out)));
  assert.equal(audioHash(resumed), audioHash(options.out));
  return { cachedCaptures: captured, resumedFrames: reused };
}

async function themeStills() {
  const observations: Record<string, unknown> = {};
  for (const theme of Object.keys(themes)) {
    const project = { ...(await fixtureProject(fixture, theme)), transparent: true };
    const file = join(root, `${theme}.png`);
    await still(project, { projectDir: fixture, out: file, at: 1.5 });
    const pixels = execFileSync(
      'ffmpeg',
      ['-v', 'error', '-i', file, '-pix_fmt', 'rgba', '-f', 'rawvideo', '-'],
      { maxBuffer: 2 * 1024 * 1024 },
    );
    let transparent = 0,
      partial = 0;
    for (let offset = 3; offset < pixels.length; offset += 4) {
      if (!pixels[offset]) transparent++;
      else if (pixels[offset]! < 255) partial++;
    }
    observations[theme] = { transparent, partial, sha256: hash(await readFile(file)) };
  }
  return observations;
}
