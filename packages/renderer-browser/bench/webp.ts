import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { BrandingSchema, resolveVisualizerConfigs, type ResolvedProject } from '@setcast/core';
import { themes } from '../../themes/src/index.ts';
import { createFixture, fixtureProject } from '../../../scripts/export-acceptance/fixture.ts';
import { pixels } from '../../../scripts/export-acceptance/measure.ts';
import { still, withRenderSession } from '../src/export/index.ts';
import { isLosslessWebp } from '../src/export/webp.ts';
import { diagnose } from '../src/diagnostics.ts';

const directory = await mkdtemp(join(tmpdir(), 'setcast-webp-'));
const out = resolve('examples/demo/out/webp-check');
await mkdir(out, { recursive: true });
try {
  await createFixture(directory);
  await withRenderSession(async () => {
    for (const name of Object.keys(themes))
      await check(await fixtureProject(directory, name), name);
    const base = await fixtureProject(directory, 'sterile-tech');
    for (const name of ['field', 'tunnel', 'constellation']) {
      const project = { ...base, visualizers: resolveVisualizerConfigs({ name, seed: 42 }) };
      await check(project, name);
      await check({ ...project, width: 360, height: 640 }, `${name}-portrait`);
    }
    await checkFailure(base);
  });
  const report = await withoutFfmpeg(() => diagnose({ require: ['still', 'webp'] }));
  assert.equal(report.ready, true);
  assert.equal(report.features.webp, 'ready');
  assert.equal(report.features.video, 'unavailable');
  await writeFile(join(out, 'doctor-without-ffmpeg.json'), JSON.stringify(report, null, 2));
  process.stdout.write(
    `webp: PASS (all themes, GPU visuals/portrait, exact PNG pixels, no FFmpeg; ${out})\n`,
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}

async function withoutFfmpeg<T>(task: () => Promise<T>): Promise<T> {
  const previous = process.env.PATH;
  process.env.PATH = directory;
  try {
    return await task();
  } finally {
    if (previous === undefined) delete process.env.PATH;
    else process.env.PATH = previous;
  }
}

async function check(project: ResolvedProject, name: string) {
  const branded = {
    ...project,
    branding: BrandingSchema.parse({
      logo: 'art.svg',
      name: 'WebP fixture',
      messages: { lines: ['Lossless rendering'], gap: 0 },
    }),
  };
  const png = join(out, `${name}.png`);
  const webp = join(out, `${name}.webp`);
  await withoutFfmpeg(async () => {
    await still(branded, { projectDir: directory, out: png, at: 1.7 });
    await still(branded, { projectDir: directory, out: join(out, `${name}-early.webp`), at: 0.4 });
    await still(branded, { projectDir: directory, out: webp, at: 1.7 });
  });
  assert(isLosslessWebp(await readFile(webp)), `${name}: not VP8L`);
  assert(pixels(png).equals(pixels(webp)), `${name}: WebP differs from PNG`);
  process.stdout.write(`${name}: lossless WebP matches PNG after an earlier seek\n`);
}

async function checkFailure(project: ResolvedProject) {
  const file = join(out, 'preserved.webp');
  await writeFile(file, 'existing output');
  const before = await readdir(out);
  await withoutFfmpeg(async () => {
    await assert.rejects(
      still(
        { ...project, background: 'missing-image.png' },
        { projectDir: directory, out: file, at: 1.7 },
      ),
      /missing-image/,
    );
    await assert.rejects(
      still(project, {
        projectDir: directory,
        out: file,
        at: 1.7,
        signal: AbortSignal.abort(new Error('cancel WebP')),
      }),
      /cancel WebP/,
    );
  });
  assert.equal(await readFile(file, 'utf8'), 'existing output');
  assert.deepEqual(await readdir(out), before);
}
