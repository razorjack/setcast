import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { createFixture, fixtureProject } from '../../../scripts/export-acceptance/fixture.ts';
import { createVideo } from '../../../scripts/export-acceptance/video.ts';
import { checkPreviewCli } from './preview-cli.ts';
import { preview } from '../src/preview/server.ts';
import { pageErrors } from './live-harness.ts';

const directory = await mkdtemp(join(tmpdir(), 'setcast-preview-'));
const out = resolve('examples/demo/out/preview-check');
await mkdir(out, { recursive: true });
await createFixture(directory);
const project = await fixtureProject(directory, 'sterile-tech');
const server = await preview(project, { projectDir: directory, port: 0 });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = pageErrors(page);
const ready = (frame: number) => page.locator(`[data-ready-frame="${frame}"]`).waitFor();
const seek = async (frame: number) => {
  await page.getByLabel('Frame number', { exact: true }).fill(String(frame));
  await ready(frame);
};
try {
  await page.goto(server.url);
  await ready(0);
  await page.getByRole('button', { name: 'Next frame', exact: true }).click();
  await ready(1);
  await page.getByRole('button', { name: 'Previous frame', exact: true }).click();
  await ready(0);
  await seek(46);
  await compareExport();
  await checkReference();
  await page.locator('.sp-inspector').evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({ path: join(out, 'desktop.png') });
  await checkPlayback();
  await checkReload();
  await checkVideo();
  await checkDelayedAsset();
  await checkFailure();
  await checkPreviewCli(directory);
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.equal((await fetch(new URL('/save', server.url), { method: 'POST' })).status, 405);
  process.stdout.write(
    'Browser preview: PASS (frame parity, seeks, playback, reference, reload, video, failure recovery, read-only server, CLI watch without Remotion)\n',
  );
} catch (error) {
  await page.screenshot({ path: join(out, 'failure.png') });
  throw error;
} finally {
  await browser.close();
  await server.close();
  await rm(directory, { recursive: true, force: true });
}

async function captureFrame() {
  const frame = page.frames().find((frame) => frame.url().endsWith('/frame.html'))!;
  return frame.locator('.setcast').screenshot({ scale: 'css' });
}
async function compareExport() {
  // Remove only the outer preview scale so both captures use composition pixels.
  const placement = await page.addStyleTag({
    content:
      '.sp-canvas { position: fixed !important; transform: none !important; left: 0 !important; top: 0 !important; }',
  });
  await placement.evaluate((style) => {
    (style as HTMLStyleElement).dataset.previewCheck = 'true';
  });
  const reference = await browser.newPage({
    viewport: { width: project.width, height: project.height },
  });
  try {
    await reference.goto(new URL('/frame.html', server.url).href);
    await reference.evaluate(() => window.setcastExport!.frame(46));
    await reference.locator('.setcast').screenshot({ path: join(out, 'export.png') });
    const captured = await captureFrame();
    await writeFile(join(out, 'preview.png'), captured);
    await comparePixels(captured, await reference.locator('.setcast').screenshot());
    const bins = await reference.evaluate(() => window.setcastExport!.resolved!.audio.bins);
    assert.equal(await page.locator('.sp-spectrum rect').count(), bins.length);
    const first = await page.locator('.sp-spectrum rect').first().getAttribute('height');
    assert.equal(Number(first), bins[0]! * 72);
  } finally {
    await reference.close();
  }
  await seek(12);
  const first = await captureFrame();
  await seek(60);
  await seek(12);
  assert(first.equals(await captureFrame()), 'Backward seek changed the same frame');
}
async function checkReference() {
  const png = await captureFrame();
  await page
    .getByLabel('Reference image', { exact: true })
    .setInputFiles({ name: 'frame.png', mimeType: 'image/png', buffer: png });
  await page.locator('.sp-reference-image').waitFor();
  await page.getByLabel('Comparison mode').selectOption('difference');
  assert.equal(
    await page
      .locator('.sp-reference-image')
      .evaluate((image) => getComputedStyle(image).mixBlendMode),
    'difference',
  );
  await page
    .getByLabel('Reference image', { exact: true })
    .setInputFiles({ name: 'invalid.png', mimeType: 'image/png', buffer: Buffer.from('invalid') });
  await page.locator('.sp-reference [role=alert]').waitFor();
  assert.equal(
    await page.locator('.sp-reference-image').count(),
    1,
    'Invalid import removed valid reference',
  );
  await page.getByRole('button', { name: 'Remove reference' }).click();
  await page.locator('style[data-preview-check]').evaluate((style) => style.remove());
}
async function checkPlayback() {
  await seek(92);
  await page.getByRole('button', { name: 'Play frames', exact: true }).click();
  await ready(94);
  assert(await page.getByRole('button', { name: 'Next frame', exact: true }).isDisabled());
  await page.getByRole('button', { name: 'First frame', exact: true }).click();
  await ready(0);
  await page.getByLabel('Frame timeline').fill('44');
  await page.getByLabel('Frame timeline').fill('69');
  await page.getByLabel('Frame timeline').fill('22');
  await ready(22);
}
async function checkReload() {
  server.report('Invalid project edit');
  await page.getByText(/Invalid project edit/).waitFor();
  await ready(22);
  server.update({ ...project, title: 'Updated title' });
  await page.getByRole('heading', { name: 'Updated title', exact: true }).waitFor();
  await ready(22);
  assert.equal(await page.locator('.sp-warning').count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(out, 'narrow.png'), fullPage: true });
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'Narrow preview overflows',
  );
  await page.setViewportSize({ width: 1440, height: 900 });
}
async function checkVideo() {
  createVideo(join(directory, 'loop.mp4'));
  server.update({
    ...project,
    title: 'Video',
    background: 'loop.mp4',
    visualizers: [],
    css: `${project.css}\n.setcast > :not(style):not(.sc-bg) { display:none; }`,
  });
  await page.getByRole('heading', { name: 'Video', exact: true }).waitFor();
  await ready(22);
  await seek(37);
  const later = await captureFrame();
  await seek(22);
  assert(!later.equals(await captureFrame()), 'Video did not seek');
  await seek(7);
  assert(later.equals(await captureFrame()), 'Video loop was not exact');
}
async function checkFailure() {
  await page.route('**/assets/art.svg', (route) => route.fulfill({ status: 404, body: 'missing' }));
  server.update({ ...project, title: 'Failed asset' });
  await page.getByRole('heading', { name: 'Failed asset', exact: true }).waitFor();
  await page.locator('.sp-frame-error').waitFor();
  await page.unroute('**/assets/art.svg');
  await page.getByRole('button', { name: 'Retry frame' }).click();
  await ready(7);
}

async function comparePixels(first: Buffer, second: Buffer) {
  const difference = await page.evaluate(
    async (images) => {
      const pixels = await Promise.all(
        images.map(async (encoded) => {
          const image = new Image();
          image.src = `data:image/png;base64,${encoded}`;
          await image.decode();
          const canvas = new OffscreenCanvas(image.width, image.height);
          const context = canvas.getContext('2d')!;
          context.drawImage(image, 0, 0);
          return context.getImageData(0, 0, image.width, image.height).data;
        }),
      );
      if (pixels[0]!.length !== pixels[1]!.length) return Infinity;
      let maximum = 0;
      for (let index = 0; index < pixels[0]!.length; index++)
        maximum = Math.max(maximum, Math.abs(pixels[0]![index]! - pixels[1]![index]!));
      return maximum;
    },
    [first.toString('base64'), second.toString('base64')],
  );
  // An iframe adds a compositor pass, which can round a color channel by one level.
  assert(difference <= 1, `Preview differs from export by ${difference} channel levels`);
}

async function checkDelayedAsset() {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/assets/art.svg', async (route) => {
    await blocked;
    await route.continue();
  });
  try {
    server.update({ ...project, title: 'Delayed art' });
    await page.getByRole('heading', { name: 'Delayed art', exact: true }).waitFor();
    await page
      .locator('.sp-holds')
      .getByText(/art.svg/)
      .first()
      .waitFor();
    assert.equal(await page.locator('.sp-workspace').getAttribute('data-ready-frame'), '');
  } finally {
    release();
  }
  await ready(7);
  await page.unroute('**/assets/art.svg');
}
