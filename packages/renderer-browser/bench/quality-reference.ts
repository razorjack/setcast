import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, statfs, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { framesWithinMix, resolveFrameRange, toSeconds } from '@setcast/core';
import { loadProject, probeAudio, readsWholeSet, readWholeSet } from '@setcast/core/node';
import { themes } from '../../themes/src/index.ts';
import type { Page } from 'playwright';
import { ffmpeg } from '../src/export/ffmpeg.ts';
import { computeExportIdentity, digestFile } from '../src/export/identity.ts';
import { projectContent } from '../../../scripts/render-compare/content.ts';
import { prepareFrame, withCapture, withRenderSession } from '../src/export/session.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    at: { type: 'string', default: '90' },
    seconds: { type: 'string', default: '10' },
    'reserve-gib': { type: 'string', default: '2' },
  },
});
if (!values.out || positionals.length > 1)
  throw new Error(
    'Pass [PROJECT] --out NEW_DIRECTORY [--at SECONDS] [--seconds SECONDS] [--reserve-gib 2].',
  );
const projectDir = resolve(positionals[0] ?? 'examples/demo');
const reserveGiB = Number(values['reserve-gib']);
if (!Number.isFinite(reserveGiB) || reserveGiB < 2 || reserveGiB > 1024)
  throw new Error('--reserve-gib must be a finite number from 2 to 1024.');
const out = resolve(values.out),
  at = Number(values.at),
  seconds = Number(values.seconds);
const loaded = await loadProject(projectDir, {
  themes,
  probeDuration: (audio, root) => probeAudio({ audio }, root),
});
const project = readsWholeSet(loaded.project)
  ? await readWholeSet(loaded.project, projectDir)
  : loaded.project;
if (
  !Number.isFinite(at) ||
  at < 0 ||
  !Number.isFinite(seconds) ||
  seconds <= 0 ||
  at + seconds > toSeconds(project.mix.duration)
)
  throw new Error('Use a finite positive range inside the mix.');
const range = resolveFrameRange(
  [at, at + seconds],
  project.fps,
  framesWithinMix(project.mix.duration, project.fps),
);
await mkdir(out);
const minimumFreeBytes = reserveGiB * 1024 ** 3 + project.width * project.height * 8;
await checkDiskSpace();
const control = new AbortController();
for (const name of ['SIGINT', 'SIGTERM'] as const)
  process.once(name, () => control.abort(new Error(`Stopped by ${name}.`)));
const options = { projectDir, signal: control.signal };
const regions: Record<string, { x: number; y: number; right: number; bottom: number }> = {};
const selectors = {
  credits: '.sc-panel',
  branding: '.sc-brand-message, .sc-brand-identity',
  tracklist: '.sc-tracklist',
};
const file = join(out, 'reference.mkv');
const input = ['-f', 'image2pipe', '-framerate', String(project.fps), '-i', 'pipe:0', '-an'];
const losslessArgs = [
  ...input,
  '-pix_fmt',
  'bgr0',
  '-c:v',
  'ffv1',
  '-level',
  '3',
  '-g',
  '1',
  '-threads',
  '2',
  '-color_range',
  'pc',
  '-colorspace',
  'rgb',
  '-color_primaries',
  'bt709',
  '-color_trc',
  'iec61966-2-1',
  file,
];
const hashArgs = [
  ...input,
  '-pix_fmt',
  'rgb24',
  '-c:v',
  'rawvideo',
  '-threads',
  '1',
  '-f',
  'hash',
  '-hash',
  'sha256',
  join(out, 'source.sha256'),
];
await withRenderSession(captureReference);
process.stdout.write(`Lossless reference: ${file}\n`);

async function captureReference() {
  const identity = await computeExportIdentity(project, { ...options, out: file }, [range]);
  const lossless = ffmpeg(losslessArgs, control.signal);
  const sourceHash = ffmpeg(hashArgs, control.signal);
  try {
    await withCapture(project, options, async (page) => {
      const cdp = await page.context().newCDPSession(page);
      for (let frame = range[0]; frame <= range[1]; frame++) {
        await checkDiskSpace();
        await prepareFrame(page, frame);
        const screenshot = await cdp.send('Page.captureScreenshot', {
          format: 'png',
          optimizeForSpeed: true,
          captureBeyondViewport: false,
        });
        const image = Buffer.from(screenshot.data, 'base64');
        await Promise.all([lossless.write(image), sourceHash.write(image)]);
        mergeRegions(await measureRegions(page));
      }
      await cdp.detach();
    });
    await Promise.all([lossless.finish(), sourceHash.finish()]);
    await identity.assertInputsUnchanged();
    await saveReference(identity.key);
  } finally {
    await Promise.all([lossless.cancel(), sourceHash.cancel()]);
  }
}

async function saveReference(identity: string) {
  const decoded = execFileSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-xerror',
      '-i',
      file,
      '-an',
      '-pix_fmt',
      'rgb24',
      '-f',
      'hash',
      '-hash',
      'sha256',
      '-',
    ],
    { encoding: 'utf8' },
  );
  assert.equal(
    decoded,
    await readFile(join(out, 'source.sha256'), 'utf8'),
    'Lossless reference changed source RGB samples',
  );
  const report = {
    version: 1,
    projectDir,
    range,
    fps: project.fps,
    width: project.width,
    height: project.height,
    frames: range[1] - range[0] + 1,
    identity,
    ...(await projectContent(project, projectDir, control.signal)),
    file,
    fileDigest: await digestFile(file),
    sourceRgbHash: decoded.trim(),
    capture: 'png-cdp-optimize-for-speed',
    minimumFreeBytes,
    regions,
    scope:
      'Untimed sequential PNG capture in pinned browser. FFV1 decoded RGB24 hash equals every source RGB sample. Regions bound all matching DOM rectangles over the range.',
  };
  await writeFile(join(out, 'reference.json'), JSON.stringify(report, null, 2) + '\n');
}

async function measureRegions(page: Page) {
  return page.evaluate(
    (selectors) =>
      Object.fromEntries(
        Object.entries(selectors).map(([name, selector]) => [
          name,
          [...document.querySelectorAll(selector)].map((node) => {
            const rect = node.getBoundingClientRect();
            return { x: rect.left, y: rect.top, right: rect.right, bottom: rect.bottom };
          }),
        ]),
      ),
    selectors,
  );
}

function mergeRegions(
  measured: Record<string, { x: number; y: number; right: number; bottom: number }[]>,
) {
  for (const [name, rectangles] of Object.entries(measured)) {
    for (const rect of rectangles) {
      const bounds = {
        x: Math.max(0, Math.floor(rect.x)),
        y: Math.max(0, Math.floor(rect.y)),
        right: Math.min(project.width, Math.ceil(rect.right)),
        bottom: Math.min(project.height, Math.ceil(rect.bottom)),
      };
      if (bounds.right - bounds.x < 8 || bounds.bottom - bounds.y < 8) continue;
      const previous = regions[name];
      regions[name] = previous
        ? {
            x: Math.min(previous.x, bounds.x),
            y: Math.min(previous.y, bounds.y),
            right: Math.max(previous.right, bounds.right),
            bottom: Math.max(previous.bottom, bounds.bottom),
          }
        : bounds;
    }
  }
}

async function checkDiskSpace() {
  const space = await statfs(out);
  const free = space.bavail * space.bsize;
  if (free < minimumFreeBytes) {
    throw new Error(
      `Lossless reference needs ${(minimumFreeBytes / 1024 ** 3).toFixed(2)} GiB of free reserve; ${(free / 1024 ** 3).toFixed(2)} GiB is available. Free space or choose an output directory on a larger volume.`,
    );
  }
}
