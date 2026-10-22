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

const directory = await mkdtemp(join(tmpdir(), 'setcast-gpu-'));
const artifacts = resolve('examples/demo/out/gpu-check');
await mkdir(artifacts, { recursive: true });
const baseCss = await readFile(new URL('../../core/css/base.css', import.meta.url), 'utf8');
const css = `${baseCss}

.setcast { background: #03080b; --accent: #68dcc9; }
.sc-bg, .sc-header, .sc-contributors, .sc-next, .sc-tracklist { display: none; }
.sc-spectrum rect { fill: var(--accent); }
.sc-radial { color: var(--accent); }
.sc-radial line, .sc-radial circle { stroke: currentColor; stroke-width: 2; }
`;

/** Each GPU visualizer, with the settings that stop its motion while audio still drives it. */
const VISUALIZERS = [
  { name: 'field', still: { speed: 0 } },
  { name: 'tunnel', still: { speed: 0, spin: 0 } },
];
const only = process.argv[2];
let exportBundle: ReturnType<typeof bundlePlayer> | undefined;

try {
  await createFixture(directory);
  const loaded = await fixtureProject(directory);
  const fixture = { ...loaded, css, background: null, panel: null, tracklist: null };
  await withRenderSession(async () => {
    for (const visualizer of VISUALIZERS) {
      if (only && visualizer.name !== only) continue;
      const project = {
        ...fixture,
        visualizers: resolveVisualizerConfigs({ name: visualizer.name, seed: 42 }),
      };
      const reference = await checkFrames(project, visualizer.name);
      await checkFreshCapture(project, visualizer.name, reference);
      await checkVariants(project, visualizer, reference);
      await checkScenes(project, visualizer.name);
      await checkUnavailable(project);
      await checkContextLoss(project, visualizer.name);
      await checkSoftware(project, visualizer.name);
      process.stdout.write(`${visualizer.name}: deterministic frames, failures and software\n`);
    }
    await checkLive(fixture);
    await benchmark(fixture);
    await softwareBenchmark(fixture);
  });
  process.stdout.write(`gpu: PASS (artifacts: ${artifacts})\n`);
} finally {
  await rm(directory, { recursive: true, force: true });
}

async function pixels(page: Page, name: string) {
  return page.evaluate((name) => {
    const canvas = document.querySelector<HTMLCanvasElement>(`.sc-${name}`)!;
    const gl = canvas.getContext('webgl2')!;
    const rgba = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    if (gl.getError() !== gl.NO_ERROR) throw new Error(`${name} draw produced a GL error`);
    if (!rgba.some((byte, index) => index % 4 === 3 && byte > 0))
      throw new Error(`${name} drew no pixels`);
    return canvas.toDataURL();
  }, name);
}

function everyPixel(page: Page) {
  return Promise.all(VISUALIZERS.map(({ name }) => pixels(page, name)));
}

async function checkFrames(project: ResolvedProject, name: string) {
  return withCapture(project, { projectDir: directory }, async (page) => {
    await prepareFrame(page, 51);
    const reference = await pixels(page, name);
    await page.screenshot({ path: join(artifacts, `${name}.png`) });
    for (const frame of [0, 70, 12, 51]) await prepareFrame(page, frame);
    assert((await pixels(page, name)) === reference, `Backward/random seeks changed ${name}`);
    await page.evaluate(async () => {
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    });
    assert(
      (await pixels(page, name)) === reference,
      `${name} drawing buffer disappeared after presentation`,
    );
    await prepareFrame(page, 50);
    assert((await pixels(page, name)) !== reference, `Time does not move ${name}`);
    return reference;
  });
}

async function checkFreshCapture(project: ResolvedProject, name: string, reference: string) {
  await Promise.all(
    [0, 1].map(() =>
      withCapture(project, { projectDir: directory }, async (page) => {
        await prepareFrame(page, 51);
        assert((await pixels(page, name)) === reference, `Fresh capture worker differs (${name})`);
      }),
    ),
  );
}

async function checkVariants(
  project: ResolvedProject,
  { name, still }: (typeof VISUALIZERS)[number],
  reference: string,
) {
  const visualizers = resolveVisualizerConfigs({ name, seed: 43 });
  await withCapture({ ...project, visualizers }, { projectDir: directory }, async (page) => {
    await prepareFrame(page, 51);
    assert((await pixels(page, name)) !== reference, `Seed does not change ${name}`);
  });
  const frozen = resolveVisualizerConfigs({ name, ...still });
  await withCapture(
    { ...project, visualizers: frozen },
    { projectDir: directory },
    async (page) => {
      await prepareFrame(page, 12);
      const silent = await pixels(page, name);
      await prepareFrame(page, 30);
      assert((await pixels(page, name)) === silent, `Stopped ${name} moved during silence`);
      await prepareFrame(page, 46);
      assert((await pixels(page, name)) !== silent, `Audio does not affect ${name}`);
      await page.addStyleTag({
        content: `.setcast .sc-${name} { color: oklch(70% 0.2 30 / 0.5); width: 50%; }`,
      });
      await prepareFrame(page, 12);
      assert((await pixels(page, name)) !== silent, `CSS color/size did not update ${name}`);
      assert.equal(await page.locator(`.sc-${name}`).getAttribute('width'), '160');
    },
  );
  await withCapture(
    { ...project, width: 360, height: 640 },
    { projectDir: directory },
    async (page) => {
      await prepareFrame(page, 51);
      await pixels(page, name);
      await page.screenshot({ path: join(artifacts, `${name}-portrait.png`) });
    },
  );
}

async function checkScenes(project: ResolvedProject, name: string) {
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
      const reference = await pixels(page, name);
      for (let index = 0; index < 10; index++) {
        await prepareFrame(page, 51);
        assert.equal(await page.locator(`.sc-${name}`).count(), 0);
        await prepareFrame(page, 12);
        assert((await pixels(page, name)) === reference, `Scene remount changed ${name}`);
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

async function checkContextLoss(project: ResolvedProject, name: string) {
  await withCapture(project, { projectDir: directory }, async (page) => {
    await prepareFrame(page, 12);
    await page.evaluate((name) => {
      const canvas = document.querySelector<HTMLCanvasElement>(`.sc-${name}`)!;
      canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext();
    }, name);
    await assert.rejects(prepareFrame(page, 13), new RegExp(`"${name}" lost its WebGL context`));
  });
}

async function benchmark(project: ResolvedProject) {
  const reports = [];
  for (const config of [
    { name: 'field', resolution: 0.5 },
    { name: 'field', resolution: 1 },
    { name: 'tunnel', resolution: 0.5 },
    { name: 'tunnel', resolution: 1 },
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
    visualizers: resolveVisualizerConfigs(VISUALIZERS.map(({ name }) => ({ name, seed: 42 }))),
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
    await page.locator('.sc-live-scene[data-ready="true"] .sc-tunnel').waitFor();
    const firstFrame = Number(await page.locator('main').getAttribute('data-frame'));
    const first = await everyPixel(page);
    await page.waitForFunction(
      (first) => Number(document.querySelector('main')?.getAttribute('data-frame')) > first + 90,
      firstFrame,
    );
    const later = await everyPixel(page);
    for (const [index, { name }] of VISUALIZERS.entries())
      assert(later[index] !== first[index], `Live ${name} did not advance`);
    assert.equal(await page.locator('main').getAttribute('data-dropped'), '0');
    await page.screenshot({ path: join(artifacts, 'live.png') });
    await page.getByRole('button', { name: 'Stop input', exact: true }).click();
    await page.getByRole('button', { name: 'Start input', exact: true }).click();
    await page.locator('[data-capture="running"]').waitFor();
    await everyPixel(page);
    assert.deepEqual(errors, [], 'Live GPU visualizers raised browser errors');
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

async function checkSoftware(project: ResolvedProject, name: string) {
  await withSoftwarePage(project, async (page) => {
    assert.match(await gpuRenderer(page), /SwiftShader/i);
    await prepareFrame(page, 51);
    const first = await pixels(page, name);
    await prepareFrame(page, 12);
    assert((await pixels(page, name)) !== first, `Software ${name} did not move`);
    await prepareFrame(page, 51);
    assert((await pixels(page, name)) === first, `Software ${name} depends on request order`);
    await page.screenshot({ path: join(artifacts, `${name}-software.png`) });
  });
}

/** SwiftShader draws on the CPU, so its frame time shows each shader's cost without a GPU. */
async function softwareBenchmark(project: ResolvedProject) {
  const reports = [];
  for (const config of [
    { name: 'field', resolution: 0.5 },
    { name: 'tunnel', resolution: 0.5 },
    { name: 'spectrum' },
  ]) {
    const scene = {
      ...project,
      width: 1920,
      height: 1080,
      visualizers: resolveVisualizerConfigs(config),
    };
    const prepareMs = await withSoftwarePage(scene, async (page) => {
      await prepareFrame(page, 0);
      const started = performance.now();
      for (let frame = 1; frame <= 20; frame++) await prepareFrame(page, frame);
      return (performance.now() - started) / 20;
    });
    const report = { config, backend: 'SwiftShader', width: 1920, height: 1080, prepareMs };
    reports.push(report);
    process.stdout.write(`${JSON.stringify(report)}\n`);
  }
  await writeFile(join(artifacts, 'software-benchmark.json'), JSON.stringify(reports, null, 2));
}

async function withSoftwarePage<T>(project: ResolvedProject, task: (page: Page) => Promise<T>) {
  exportBundle ??= bundlePlayer('export.tsx');
  const captureFiles = await exportBundle;
  const server = await play(project, { projectDir: directory, port: 0, captureFiles });
  try {
    const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
    try {
      const page = await browser.newPage({
        viewport: { width: project.width, height: project.height },
      });
      await page.goto(server.url);
      await page.waitForFunction(() => Boolean(window.setcastExport));
      return await task(page);
    } finally {
      await browser.close();
    }
  } finally {
    await server.close();
  }
}
