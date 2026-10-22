import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { resolveVisualizerConfigs, type ResolvedProject } from '@setcast/core';
import { createFixture, fixtureProject } from '../../../scripts/export-acceptance/fixture.ts';
import { play } from '../src/index.ts';
import { bundlePlayer } from '../src/bundle.ts';
import { prepareFrame, withCapture, withRenderSession } from '../src/export/session.ts';

const directory = await mkdtemp(join(tmpdir(), 'setcast-field-'));
const artifacts = resolve('examples/demo/out/field-check');
await mkdir(artifacts, { recursive: true });
const baseCss = await readFile(new URL('../../core/css/base.css', import.meta.url), 'utf8');
const css = `${baseCss}

.setcast { background: #03080b; --accent: #68dcc9; }
.sc-bg, .sc-header, .sc-contributors, .sc-next, .sc-tracklist { display: none; }
.sc-field { color: var(--accent); }
.sc-spectrum rect { fill: var(--accent); }
.sc-radial { color: var(--accent); }
.sc-radial line, .sc-radial circle { stroke: currentColor; stroke-width: 2; }
`;

try {
  await createFixture(directory);
  const loaded = await fixtureProject(directory);
  const project = {
    ...loaded,
    css,
    background: null,
    panel: null,
    tracklist: null,
    visualizers: resolveVisualizerConfigs({ name: 'field', seed: 42 }),
  };
  await withRenderSession(async () => {
    const reference = await checkFrames(project);
    await checkFreshCapture(project, reference);
    await checkVariants(project, reference);
    await checkScenes(project);
    await checkUnavailable(project);
    await checkContextLoss(project);
    await checkLive(project);
    await checkSoftware(project);
    await benchmark(project);
  });
  process.stdout.write(`field: PASS (artifacts: ${artifacts})\n`);
} finally {
  await rm(directory, { recursive: true, force: true });
}

async function pixels(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.sc-field')!;
    const gl = canvas.getContext('webgl2')!;
    const rgba = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    assertPixels(gl, rgba);
    return canvas.toDataURL();
    function assertPixels(context: WebGL2RenderingContext, bytes: Uint8Array) {
      if (context.getError() !== context.NO_ERROR)
        throw new Error('Field draw produced a GL error');
      if (!bytes.some((byte, index) => index % 4 === 3 && byte > 0))
        throw new Error('Field drew no pixels');
    }
  });
}

async function checkFrames(project: ResolvedProject) {
  return withCapture(project, { projectDir: directory }, async (page) => {
    await prepareFrame(page, 51);
    const reference = await pixels(page);
    await page.screenshot({ path: join(artifacts, 'field.png') });
    for (const frame of [0, 70, 12, 51]) await prepareFrame(page, frame);
    assert((await pixels(page)) === reference, 'Backward/random seeks changed field pixels');
    await page.evaluate(async () => {
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    });
    assert((await pixels(page)) === reference, 'Drawing buffer disappeared after presentation');
    await prepareFrame(page, 50);
    assert((await pixels(page)) !== reference, 'Time does not move the field');
    return reference;
  });
}

async function checkFreshCapture(project: ResolvedProject, reference: string) {
  await Promise.all(
    [0, 1].map(() =>
      withCapture(project, { projectDir: directory }, async (page) => {
        await prepareFrame(page, 51);
        assert((await pixels(page)) === reference, 'Fresh capture worker differs');
      }),
    ),
  );
}

async function checkVariants(project: ResolvedProject, reference: string) {
  const visualizers = resolveVisualizerConfigs({ name: 'field', seed: 43 });
  await withCapture({ ...project, visualizers }, { projectDir: directory }, async (page) => {
    await prepareFrame(page, 51);
    assert((await pixels(page)) !== reference, 'Seed does not change the field');
  });
  const frozen = resolveVisualizerConfigs({ name: 'field', speed: 0 });
  await withCapture(
    { ...project, visualizers: frozen },
    { projectDir: directory },
    async (page) => {
      await prepareFrame(page, 12);
      const silent = await pixels(page);
      await prepareFrame(page, 30);
      assert((await pixels(page)) === silent, 'speed: 0 moved during silence');
      await prepareFrame(page, 46);
      assert((await pixels(page)) !== silent, 'Audio does not affect the field');
      await page.addStyleTag({
        content: '.setcast .sc-field { color: oklch(70% 0.2 30 / 0.5); width: 50%; }',
      });
      await prepareFrame(page, 12);
      assert((await pixels(page)) !== silent, 'CSS color/size did not update');
      assert.equal(await page.locator('.sc-field').getAttribute('width'), '160');
    },
  );
  await withCapture(
    { ...project, width: 360, height: 640 },
    { projectDir: directory },
    async (page) => {
      await prepareFrame(page, 51);
      await pixels(page);
      await page.screenshot({ path: join(artifacts, 'portrait.png') });
    },
  );
}

async function checkScenes(project: ResolvedProject) {
  const scene = {
    ...project,
    audio: null,
    mix: null,
    panel: null,
    tracklist: null,
    theme: 'alternate',
    visualizers: resolveVisualizerConfigs({ name: 'radial' }),
    live: { clock: false, input: { channels: null, gain: 1, delay: 0 } },
  };
  await withCapture(
    { ...project, scenes: [{ at: 1, scene }] },
    { projectDir: directory },
    async (page) => {
      await prepareFrame(page, 12);
      const reference = await pixels(page);
      for (let index = 0; index < 10; index++) {
        await prepareFrame(page, 51);
        assert.equal(await page.locator('.sc-field').count(), 0);
        await prepareFrame(page, 12);
        assert((await pixels(page)) === reference, 'Scene remount changed field pixels');
      }
    },
  );
}

async function checkUnavailable(project: ResolvedProject) {
  await withCapture(project, { projectDir: directory }, async (page) => {
    await page.evaluate(() => {
      const getContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext')!
        .value as HTMLCanvasElement['getContext'];
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        ...args: Parameters<typeof getContext>
      ) {
        if (args[0] === 'webgl2') return null;
        return getContext.apply(this, args);
      } as typeof getContext;
    });
    await assert.rejects(prepareFrame(page, 12), /needs WebGL 2/);
  });
}

async function checkContextLoss(project: ResolvedProject) {
  await withCapture(project, { projectDir: directory }, async (page) => {
    await prepareFrame(page, 12);
    await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('.sc-field')!;
      canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext();
    });
    await assert.rejects(prepareFrame(page, 13), /lost its WebGL context/);
  });
}

async function benchmark(project: ResolvedProject) {
  const reports = [];
  for (const config of [
    { name: 'field', resolution: 0.5 },
    { name: 'field', resolution: 1 },
    { name: 'spectrum' },
    { name: 'radial' },
  ]) {
    const scene = {
      ...project,
      width: 1920,
      height: 1080,
      visualizers: resolveVisualizerConfigs(config),
    };
    const report = await withCapture(scene, { projectDir: directory }, async (page) => {
      await prepareFrame(page, 0);
      const gpu = await gpuRenderer(page);
      const timings = [];
      const started = performance.now();
      for (let frame = 1; frame <= 60; frame++) {
        const timing = await prepareFrame(page, frame);
        const captured = performance.now();
        await page.screenshot({ type: 'jpeg', quality: 95 });
        timings.push({ ...timing, captureMs: performance.now() - captured });
      }
      const seconds = (performance.now() - started) / 1000;
      return {
        config,
        runtime: {
          chromium: page.context().browser()!.version(),
          node: process.version,
          platform: process.platform,
          arch: process.arch,
          gpu,
        },
        seconds,
        framesPerSecond: 60 / seconds,
        commitMs: timings.reduce((sum, timing) => sum + timing.commitMs, 0) / 60,
        captureMs: timings.reduce((sum, timing) => sum + timing.captureMs, 0) / 60,
      };
    });
    reports.push(report);
    process.stdout.write(`${JSON.stringify(report)}\n`);
  }
  await writeFile(join(artifacts, 'benchmark.json'), JSON.stringify(reports, null, 2));
}

async function checkLive(project: ResolvedProject) {
  const live = {
    ...project,
    audio: null,
    mix: null,
    panel: null,
    tracklist: null,
    live: { clock: false, input: { channels: null, gain: 1, delay: 0 } },
  };
  const server = await play(live, { projectDir: directory, port: 0 });
  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({
      args: [
        '--use-gl=angle',
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(server.url);
    await page.getByRole('button', { name: 'Start input', exact: true }).click();
    await page.locator('[data-capture="running"]').waitFor();
    await page.locator('.sc-live-scene[data-ready="true"] .sc-field').waitFor();
    const firstFrame = Number(await page.locator('main').getAttribute('data-frame'));
    const first = await pixels(page);
    await page.waitForFunction(
      (first) => Number(document.querySelector('main')?.getAttribute('data-frame')) > first + 90,
      firstFrame,
    );
    assert((await pixels(page)) !== first, 'Live field did not advance');
    assert.equal(await page.locator('main').getAttribute('data-dropped'), '0');
    await page.screenshot({ path: join(artifacts, 'live.png') });
    await page.getByRole('button', { name: 'Stop input', exact: true }).click();
    await page.getByRole('button', { name: 'Start input', exact: true }).click();
    await page.locator('[data-capture="running"]').waitFor();
    await pixels(page);
    assert.deepEqual(errors, [], 'Live field raised browser errors');
  } finally {
    await browser?.close();
    await server.close();
  }
}

async function gpuRenderer(page: Page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2')!;
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debug
      ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return renderer as string;
  });
}

async function checkSoftware(project: ResolvedProject) {
  const captureFiles = await bundlePlayer('export.tsx');
  const server = await play(project, { projectDir: directory, port: 0, captureFiles });
  try {
    const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
    try {
      const page = await browser.newPage({
        viewport: { width: project.width, height: project.height },
      });
      await page.goto(server.url);
      await page.waitForFunction(() => Boolean(window.setcastExport));
      assert.match(await gpuRenderer(page), /SwiftShader/i);
      await prepareFrame(page, 51);
      const first = await pixels(page);
      await prepareFrame(page, 12);
      assert((await pixels(page)) !== first, 'Software field did not move');
      await prepareFrame(page, 51);
      assert((await pixels(page)) === first, 'Software field depends on request order');
      await page.screenshot({ path: join(artifacts, 'software.png') });
    } finally {
      await browser.close();
    }
  } finally {
    await server.close();
  }
}
