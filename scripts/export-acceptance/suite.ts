import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Exporter, RenderProgress } from '../../packages/core/src/index.ts';
import { createFixture, fixtureProject, FPS, FRAME_COUNT } from './fixture.ts';
import { checkSync, checkTracks, pixels } from './measure.ts';
import { checkReadiness, type AcceptanceContext } from './readiness.ts';
import { checkVideo } from './video.ts';

export async function runAcceptance(
  exporter: Exporter,
  out: string,
  reference?: string,
): Promise<void> {
  await mkdir(out, { recursive: true });
  if (reference)
    assert.notEqual(
      await realpath(out),
      await realpath(reference),
      'Reference and output directories must differ',
    );
  const projectDir = await mkdtemp(join(tmpdir(), 'setcast-export-acceptance-'));
  try {
    await createFixture(projectDir);
    const project = await fixtureProject(projectDir);
    const context = { exporter, project, projectDir, out };
    await exporter.withRenderSession(async () => {
      await checkExports(context);
      await checkReadiness(context);
      await checkVideo(context);
      await checkThemes(context, reference);
      await checkFailure(context);
    });
    // A new session must work after both successful and failed jobs in the previous session.
    await exporter.still(project, { projectDir, out: join(out, 'after-session.png'), at: 1.7 });
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
}

async function checkExports({
  exporter,
  project,
  projectDir,
  out,
}: AcceptanceContext): Promise<void> {
  for (const chunkSeconds of [0, 1]) {
    const progress: RenderProgress[] = [];
    const file = join(out, `chunk-${chunkSeconds}.mp4`);
    const result = await exporter.render(project, {
      projectDir,
      out: file,
      range: [1.05, 8],
      chunkSeconds,
      concurrency: 2,
      onProgress: (event) => progress.push(event),
    });
    assert.equal(result.file, file);
    assert.equal(result.frames, FRAME_COUNT);
    assert.equal(result.durationSeconds, FRAME_COUNT / FPS);
    assert(
      progress.some((event) => event.progress === 1),
      'Export never reported completion',
    );
    for (const event of progress)
      assert(Number.isFinite(event.progress) && event.progress >= 0 && event.progress <= 1);
    checkTracks(file);
    checkSync(file);
    console.log(`  fractional range and partial final frame: chunkSeconds=${chunkSeconds}`);
  }
}

async function checkThemes(context: AcceptanceContext, reference?: string): Promise<void> {
  const { exporter, projectDir, out } = context;
  for (const theme of ['sterile-tech', 'darkroom', 'relief']) {
    const project = await fixtureProject(projectDir, theme);
    // The portrait case also exercises container queries and different art fitting.
    if (theme === 'relief') [project.width, project.height] = [360, 640];
    const file = join(out, `${theme}.png`);
    const first = await exporter.still(project, { projectDir, out: file, at: 1.7 });
    assert.equal(first.timeSeconds, 1.7);
    const early = join(out, `${theme}-early.png`);
    await exporter.still(project, { projectDir, out: early, at: 0.4 });
    const repeat = join(out, `${theme}-repeat.png`);
    await exporter.still(project, { projectDir, out: repeat, at: 1.7 });
    const image = pixels(file);
    assert.equal(image.length, project.width * project.height * 3);
    assert(!image.equals(pixels(early)), `${theme}: different times produced identical pixels`);
    assert(image.equals(pixels(repeat)), `${theme}: capture depends on job order`);
    if (reference)
      assert(
        image.equals(pixels(join(reference, `${theme}.png`))),
        `${theme}: differs from reference exporter`,
      );
    console.log(`  ${theme}: repeatable pixels${reference ? ', matches reference' : ''}`);
  }
}

async function checkFailure({
  exporter,
  project,
  projectDir,
  out,
}: AcceptanceContext): Promise<void> {
  const file = join(out, 'preserved.mp4');
  await writeFile(file, 'previous export');
  const before = (await readdir(out)).sort();
  await assert.rejects(
    exporter.render(
      { ...project, background: 'missing-image.png' },
      {
        projectDir,
        out: file,
        range: [1.05, 8],
        chunkSeconds: 1,
        concurrency: 2,
      },
    ),
    /missing-image\.png/,
  );
  assert.equal(await readFile(file, 'utf8'), 'previous export');
  assert.deepEqual((await readdir(out)).sort(), before, 'Failed export leaked temporary files');
  const still = await exporter.still(project, {
    projectDir,
    out: join(out, 'after-failure.png'),
    at: 100,
  });
  assert.equal(still.timeSeconds, 94 / FPS, 'Still must clamp inside the finite mix');
  console.log('  failed chunked export preserves destination, cleans up, and permits another job');
}
