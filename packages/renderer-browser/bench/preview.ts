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
  await checkMusicalNavigation();
  await page.locator('.sp-inspector').evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({ path: join(out, 'desktop.png') });
  await checkAudiblePlayback();
  await checkPlayback();
  await checkReload();
  await checkAudioReload();
  await checkVideo();
  await checkDelayedAsset();
  await checkAudioFailure();
  await checkFailure();
  await checkPreviewCli(directory);
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.equal((await fetch(new URL('/save', server.url), { method: 'POST' })).status, 405);
  process.stdout.write(
    'Browser preview: PASS (frame parity, audio clock with slow frames, exact pause/seek, silent playback, audio cleanup/failure, reference, reload, video, read-only server, CLI watch without Remotion)\n',
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
  await page.getByLabel('Playback mode').selectOption('frames');
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
  await page.getByLabel('Playback mode').focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('End');
  assert.equal(await page.locator('.sp-workspace').getAttribute('data-requested'), '22');
  await page.getByLabel('Preview volume').focus();
  await page.keyboard.press('End');
  assert.equal(await page.locator('.sp-workspace').getAttribute('data-requested'), '22');
}

async function checkAudiblePlayback() {
  await seek(21);
  await page.getByLabel('Preview volume').fill('0.4');
  const media = page.locator('audio[data-setcast-preview-audio]');
  assert.deepEqual(
    await media.evaluate((audio: HTMLAudioElement) => ({
      paused: audio.paused,
      muted: audio.muted,
      volume: audio.volume,
    })),
    { paused: true, muted: false, volume: 0.4 },
  );
  await delayPreviewFrames();
  await page.getByRole('button', { name: 'Play mix', exact: true }).click();
  await page.waitForFunction(() => {
    const audio = document.querySelector<HTMLAudioElement>('audio[data-setcast-preview-audio]')!;
    return !audio.paused && audio.currentTime > 1.5;
  });
  await page.getByRole('button', { name: 'Pause mix', exact: true }).click();
  const at = await media.evaluate((audio: HTMLAudioElement) => Math.floor(audio.currentTime * 30));
  await ready(at);
  assert.equal(await media.evaluate((audio: HTMLAudioElement) => audio.paused), true);
  assert.equal(new URL(page.url()).searchParams.get('frame'), String(at));
  const rendered = await page.evaluate(() => {
    const driver = document.querySelector('iframe')!.contentWindow!.setcastExport!;
    return (driver as typeof driver & { previewTestFrames: number[] }).previewTestFrames;
  });
  assert(
    rendered.some((frame, index) => index > 0 && frame > rendered[index - 1]! + 1),
    'Slow preview did not skip frames to follow audio',
  );
  await seek(12);
  assert.equal(await media.evaluate((audio: HTMLAudioElement) => audio.currentTime), 12 / 30);
  await page.reload();
  await ready(12);
  assert.equal(await page.locator('audio[data-setcast-preview-audio]').count(), 1);
  await seek(92);
  await page.getByRole('button', { name: 'Play mix', exact: true }).click();
  await page.waitForFunction((duration) => {
    const audio = document.querySelector<HTMLAudioElement>('audio[data-setcast-preview-audio]')!;
    return audio.paused && (audio.ended || audio.currentTime >= duration);
  }, project.mix.duration / 1_000_000);
  await ready(94);
  await seek(12);
}

async function checkAudioFailure() {
  await page.route('**/assets/tone.wav', (route) =>
    route.request().resourceType() === 'media'
      ? route.fulfill({ status: 404, body: 'missing audio' })
      : route.continue(),
  );
  await page.reload();
  await page.getByRole('alert').filter({ hasText: 'Cannot play tone.wav' }).waitFor();
  await seek(7);
  await page.getByLabel('Playback mode').selectOption('frames');
  assert(await page.getByRole('button', { name: 'Play frames', exact: true }).isEnabled());
  await page.unroute('**/assets/tone.wav');
  await page.getByRole('button', { name: 'Retry frame' }).click();
  await ready(7);
  assert.equal(
    await page.getByRole('alert').filter({ hasText: 'Cannot play tone.wav' }).count(),
    0,
  );
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

async function checkAudioReload() {
  await page.getByLabel('Playback mode').selectOption('audio');
  await page.getByLabel('Preview volume').fill('0.35');
  await seek(0);
  const old = await page.locator('audio[data-setcast-preview-audio]').elementHandle();
  assert(old);
  await page.getByRole('button', { name: 'Play mix', exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLAudioElement>('audio[data-setcast-preview-audio]')!.currentTime >
      0.3,
  );
  const before = Number(await page.locator('.sp-workspace').getAttribute('data-requested'));
  server.update({ ...project, title: 'Audio reload' });
  await page.getByRole('heading', { name: 'Audio reload', exact: true }).waitFor();
  assert(
    await old.evaluate((element) => !element.isConnected && (element as HTMLAudioElement).paused),
    'Reload left the previous audio playing',
  );
  const after = Number(await page.locator('.sp-workspace').getAttribute('data-requested'));
  assert(after >= before, 'Reload lost the live preview position');
  await ready(after);
  assert.equal(await page.locator('audio[data-setcast-preview-audio]').count(), 1);
  assert.equal(await page.getByLabel('Preview volume').inputValue(), '0.35');
  assert.equal(await page.getByLabel('Playback mode').inputValue(), 'audio');
  assert(
    await page
      .locator('audio[data-setcast-preview-audio]')
      .evaluate((element) => (element as HTMLAudioElement).paused),
  );
  await old.dispose();
  await seek(22);
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

async function delayPreviewFrames() {
  await page.evaluate(() => {
    const driver = document.querySelector('iframe')!.contentWindow!.setcastExport!;
    const original = driver.frame.bind(driver);
    const requested: number[] = [];
    Object.assign(driver, {
      previewTestFrames: requested,
      frame: async (frame: number) => {
        await new Promise((done) => setTimeout(done, 120));
        requested.push(frame);
        return original(frame);
      },
    });
  });
}

async function checkMusicalNavigation() {
  await seek(0);
  assert(await page.getByRole('button', { name: 'Next beat', exact: true }).isDisabled());
  await page.getByRole('button', { name: 'Next mark', exact: true }).click();
  await ready(45);
  await page.getByRole('button', { name: 'Set in here' }).click();
  await page.getByLabel('Navigation kind').selectOption('annotation');
  await page.getByRole('button', { name: 'Next mark', exact: true }).click();
  await ready(75);
  await page.getByLabel('Timeline mark').selectOption('45');
  await ready(45);
  await seek(94);
  await page.getByRole('button', { name: 'Set out here' }).click();
  assert.equal(await page.getByLabel('In frame', { exact: true }).inputValue(), '45');
  assert.equal(await page.getByLabel('Out frame', { exact: true }).inputValue(), '94');
  await page
    .locator('.sp-range')
    .getByText('50 frames · 1.667 s. Both endpoints included.')
    .waitFor();
  await page.getByRole('button', { name: 'Go to in' }).click();
  await ready(45);
  await page.getByRole('button', { name: 'Go to out' }).click();
  await ready(94);
  server.update({ ...project, title: 'Navigation tempo', bpm: 174, beatOffset: 0.1 });
  await page.getByRole('heading', { name: 'Navigation tempo', exact: true }).waitFor();
  await ready(94);
  assert.equal(await page.getByLabel('In frame', { exact: true }).inputValue(), '45');
  assert.equal(await page.getByLabel('Out frame', { exact: true }).inputValue(), '94');
  await seek(3);
  await page.getByRole('button', { name: 'Next beat', exact: true }).click();
  await ready(14);
  await page.getByRole('button', { name: 'Previous beat', exact: true }).click();
  await ready(3);
  await page.getByRole('button', { name: 'Next bar', exact: true }).click();
  await ready(45);
  await page.getByLabel('In frame', { exact: true }).fill('92');
  await page.getByLabel('Out frame', { exact: true }).fill('7');
  assert.equal(await page.getByLabel('In frame', { exact: true }).inputValue(), '7');
  await page.getByRole('button', { name: 'Whole mix' }).click();
  assert.equal(await page.getByLabel('Out frame', { exact: true }).inputValue(), '94');
  server.update(project);
  await page.getByRole('heading', { name: project.title, exact: true }).waitFor();
  await ready(45);
  await seek(12);
}
