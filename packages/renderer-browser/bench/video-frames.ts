import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { ResolvedProject } from '@setcast/core';
import { themes } from '../../themes/src/index.ts';
import { createFixture, fixtureProject } from '../../../scripts/export-acceptance/fixture.ts';
import { prepareFrame, withCapture, withRenderSession } from '../src/export/session.ts';

const { values } = parseArgs({
  options: {
    theme: { type: 'string' },
    'image-only': { type: 'boolean' },
    out: { type: 'string', default: 'examples/demo/out/video-frames' },
  },
});
if (values.theme && !themes[values.theme]) throw new Error(`Unknown theme ${values.theme}.`);
const directory = await mkdtemp(join(tmpdir(), 'setcast-video-frames-'));
const out = resolve(values.out);
const differences: { name: string; frame: number; max: number; mean: number; rms: number }[] = [];
const failures: string[] = [];
const results: { theme: string; shape: string; fit: string; element: string }[] = [];
await mkdir(out, { recursive: true });
try {
  await createFixture(directory);
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=s=960x540:r=25:d=1.2',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    join(directory, 'motion.mp4'),
  ]);
  await withRenderSession(async () => {
    for (const theme of values.theme ? [values.theme] : Object.keys(themes)) {
      const project = await fixtureProject(directory, theme);
      for (const [width, height] of [
        [640, 360],
        [360, 640],
      ]) {
        for (const fit of ['cover', 'contain'] as const) {
          const scene = {
            ...project,
            width: width!,
            height: height!,
            background: 'motion.mp4',
            backgroundFit: fit,
          };
          const element = await compare(scene, `${theme}-${width}-${fit}`);
          results.push({ theme, shape: `${width}x${height}`, fit, element });
          await writeFile(
            join(out, 'report.json'),
            JSON.stringify({ results, differences, failures }, null, 2),
          );
        }
      }
      process.stdout.write(
        `  ${theme}: canvas/image comparison complete in both shapes and fits\n`,
      );
    }
    const project = await fixtureProject(directory, 'sterile-tech');
    await compare({ ...project, fps: 60, background: 'motion.mp4' }, '60fps');
    await checkSelectors({ ...project, background: 'motion.mp4' });
  });
  await writeFile(
    join(out, 'report.json'),
    JSON.stringify({ results, differences, failures }, null, 2),
  );
  if (!values['image-only'])
    assert(
      results.some((result) => result.element === 'CANVAS'),
      'Apply the archived video-canvas experiment patch before this comparison.',
    );
  assert.equal(
    failures.length,
    0,
    `Video differences exceed tolerance: ${failures.join(', ')}. Inspect ${out}.`,
  );
  process.stdout.write(
    `Video frames: PASS (${results.length} theme/shape/fit cases, shuffled seeks, 25-to-30/60 fps, selector fallback)\n`,
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}

async function compare(project: ResolvedProject, name: string) {
  if (values['image-only'])
    project = {
      ...project,
      css: `${project.css}\n.setcast-image-control img { visibility: hidden; }`,
    };
  const fallback = {
    ...project,
    css: `${project.css}\n.setcast-image-reference img { visibility: hidden; }`,
  };
  return withCapture(project, { projectDir: directory }, (page) =>
    withCapture(fallback, { projectDir: directory }, async (reference) => {
      let element = '';
      for (const frame of [29, 36, 7, 0, 29]) {
        await prepareFrame(page, frame);
        await prepareFrame(reference, frame);
        element = await page
          .locator('.sc-bg-img')
          .first()
          .evaluate((node) => node.tagName);
        assert.equal(
          await reference
            .locator('.sc-bg-img')
            .first()
            .evaluate((node) => node.tagName),
          'IMG',
        );
        const actual = await page.screenshot();
        const expected = await reference.screenshot();
        const actualFile = join(out, `${name}-${frame}-canvas.png`);
        const expectedFile = join(out, `${name}-${frame}-image.png`);
        await writeFile(actualFile, actual);
        await writeFile(expectedFile, expected);
        const difference = pixelDifference(actualFile, expectedFile);
        differences.push({ name, frame, ...difference });
        if (difference.max > 8 || difference.mean > 0.1 || difference.rms > 0.5) {
          await writeFile(join(out, `${name}-${frame}-canvas.png`), actual);
          await writeFile(join(out, `${name}-${frame}-image.png`), expected);
          failures.push(`${name}:${frame}`);
        }
      }
      return element;
    }),
  );
}

async function checkSelectors(project: ResolvedProject) {
  for (const selector of [
    'img.sc-bg-img',
    '.sc-bg > :first-of-type',
    '.sc-bg > canvas',
    '.sc-bg > i\\6d g',
  ]) {
    await withCapture(
      { ...project, css: `${project.css}\n${selector} { opacity: 0.7; }` },
      { projectDir: directory },
      async (page) => {
        await prepareFrame(page, 7);
        assert.equal(
          await page
            .locator('.sc-bg-img')
            .first()
            .evaluate((node) => node.tagName),
          'IMG',
        );
      },
    );
  }
}

function pixelDifference(actual: string, expected: string) {
  const decode = (input: string) =>
    execFileSync(
      'ffmpeg',
      [
        '-v',
        'error',
        '-i',
        input,
        '-frames:v',
        '1',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        'pipe:1',
      ],
      { timeout: 10000, maxBuffer: 16 * 1024 * 1024 },
    );
  const a = decode(actual);
  const b = decode(expected);
  assert.equal(a.length, b.length);
  let sum = 0;
  let squared = 0;
  let max = 0;
  for (let index = 0; index < a.length; index++) {
    const difference = Math.abs(a[index]! - b[index]!);
    sum += difference;
    squared += difference ** 2;
    max = Math.max(max, difference);
  }
  return { max, mean: sum / a.length, rms: Math.sqrt(squared / a.length) };
}
