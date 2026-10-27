import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { type Page } from 'playwright';
import { loadLiveProject } from '@setcast/core/node';
import { VenueSchema } from '@setcast/core';
import { play } from '../src/index.ts';
import { launchLiveBrowser, pageErrors, writeFixture } from './live-harness.ts';

const root = await writeFixture('projection', {
  'art.svg':
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#428277"/><circle cx="200" cy="150" r="100" fill="#e8b85a"/></svg>',
  'theme.css':
    '.setcast { background:#09212b; color:white; } .sc-bg-img {width:100%; height:100%; object-fit:cover;transform:none !important;} .sc-art {display:none;} .sc-spectrum {color:white;}',
  'live.yaml': `theme: ./theme.css
title: Projector qualification
background: art.svg
output: {width: 960, height: 540, fps: 30}
visualizer:
  - {name: field, resolution: 0.25, seed: 42}
  - {name: spectrum, fill: art}
projection: {enabled: false}
`,
});
const out = resolve('examples/demo/out/projection-check');
await mkdir(out, { recursive: true });
const { project } = await loadLiveProject(root);
project.css += `@font-face {font-family:ProjectionTest;src:url('/projection-test.woff2')} @media (width:960px){ .sc-stage{font-family:ProjectionTest} .sc-header{font-family:ProjectionTest !important} }`;
const font = await readFile(resolve('packages/themes/fonts/JetBrainsMono-100-800-latin.woff2'));
let releaseFont = () => {};
const fontReady = new Promise<void>((resolve) => {
  releaseFont = resolve;
});
const server = await play(project, { projectDir: root, port: 0 });
const browser = await launchLiveBrowser();
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  const page = await context.newPage();
  const errors = pageErrors(page);
  await page.goto(server.url);
  await page.getByRole('button', { name: 'Start input', exact: true }).click();
  await page.locator('[data-input-available=true]').waitFor();
  const first = Number(await page.locator('main').getAttribute('data-frame'));
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Operator window', exact: true }).click();
  const operator = await popup;
  await operator.waitForFunction(
    () => getComputedStyle(document.body).backgroundColor === 'rgb(16, 19, 24)',
  );
  // Install interception after the popup stylesheet loads; Chromium can stall that initial request.
  await page.context().route('**/projection-test.woff2', async (route) => {
    if (route.request().frame().parentFrame()) await fontReady;
    await route.fulfill({ contentType: 'font/woff2', body: font });
  });
  await operator.locator('.sc-projection-settings summary').click();
  const fontRequest = page.waitForRequest(
    (request) =>
      request.url().endsWith('/projection-test.woff2') && Boolean(request.frame().parentFrame()),
  );
  await operator.getByLabel('Enable projection correction').check();
  await fontRequest;
  const frame = page.frameLocator('iframe[title="Projected scene"]');
  assert.equal(
    await frame.locator('.sc-live-scene[data-ready=true]').count(),
    0,
    'Scene became ready before iframe font',
  );
  assert.equal(
    await frame.locator('.sc-stage').evaluate((el) => getComputedStyle(el).visibility),
    'hidden',
  );
  releaseFont();
  await frame.locator('.sc-live-scene[data-ready=true] .sc-stage').waitFor();
  const gpu = frame.locator('canvas.sc-field');
  const gpuBefore = await gpu.evaluate((el) => (el as HTMLCanvasElement).toDataURL());
  const start = Number(await page.locator('main').getAttribute('data-frame'));
  await page.waitForFunction(
    (start) => Number(document.querySelector('main')?.getAttribute('data-frame')) > start + 30,
    start,
  );
  assert.notEqual(
    await gpu.evaluate((el) => (el as HTMLCanvasElement).toDataURL()),
    gpuBefore,
    'Projected GPU field did not advance',
  );
  const beforeLoss = Number(await page.locator('main').getAttribute('data-frame'));
  await gpu.evaluate(
    (el) =>
      new Promise<void>((resolve) => {
        const canvas = el as HTMLCanvasElement;
        const extension = canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
        canvas.addEventListener(
          'webglcontextlost',
          () => {
            resolve();
            setTimeout(() => extension.restoreContext(), 500);
          },
          { once: true },
        );
        extension.loseContext();
      }),
  );
  await frame.locator('canvas.sc-field[data-gpu-state="recovering"]').waitFor();
  await frame.locator('canvas.sc-field[data-gpu-state="ready"]').waitFor();
  assert(Number(await page.locator('main').getAttribute('data-frame')) > beforeLoss);
  assert.equal(await page.locator('main').getAttribute('data-dropped'), '0');
  assert.match(
    await operator.locator('.sc-live-notice').innerText(),
    /recovered its graphics context/,
  );
  assert.equal(await frame.getByText(/graphics context/).count(), 0);
  const artBefore = await frame
    .locator('.sc-bg-copy')
    .evaluate((el) => (el as HTMLElement).style.cssText);
  await operator.getByLabel('Top-left X', { exact: true }).fill('12');
  await operator.getByLabel('Top-left Y', { exact: true }).fill('15');
  await operator.getByLabel('Top-right X', { exact: true }).fill('85');
  await operator.getByLabel('Bottom-left Y', { exact: true }).fill('85');
  const geometry = await frame.locator('.sc-stage').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [r.x, r.y, r.width, r.height];
  });
  assert.deepEqual(geometry, [0, 0, 960, 540], 'Warp changed scene measurement coordinates');
  assert.equal(
    await frame.locator('.sc-bg-copy').evaluate((el) => (el as HTMLElement).style.cssText),
    artBefore,
  );
  const transform = await page.locator('iframe').evaluate((el) => el.style.transform);
  await operator.getByLabel('Top-left X', { exact: true }).fill('100');
  await operator.getByText(/Projection corners must form/).waitFor();
  assert.equal(await page.locator('iframe').evaluate((el) => el.style.transform), transform);
  await operator.getByLabel('Move Top-left corner', { exact: true }).press('ArrowRight');
  assert.equal(await operator.getByLabel('Top-left X', { exact: true }).inputValue(), '12.1');
  await dragCorner(operator);
  await operator.getByLabel('Crop top', { exact: true }).fill('5');
  assert.match(await page.locator('iframe').evaluate((el) => el.style.clipPath), /inset\(5%/);
  await operator.getByRole('button', { name: 'Add mask', exact: true }).click();
  assert.equal(
    await page.locator('.sc-projection-mask').evaluate((el) => (el as HTMLElement).style.width),
    '20%',
  );
  await operator.getByLabel('Show calibration pattern').check();
  await frame.locator('.sc-calibration').waitFor();
  await operator.getByRole('button', { name: 'Blackout', exact: true }).click();
  await page.waitForFunction(
    () =>
      document
        .querySelector('iframe')
        ?.contentDocument?.querySelector<SVGElement>('.sc-calibration svg')?.style.opacity === '0',
  );
  await assertBlack(page);
  await operator.getByRole('button', { name: 'Restore output', exact: true }).click();
  await checkVenues(page, operator);
  await operator.getByLabel('Show calibration pattern').check();
  await page.screenshot({ path: join(out, 'calibration.png') });
  await operator.screenshot({ path: join(out, 'operator.png'), fullPage: true });
  assert(
    Number(await page.locator('main').getAttribute('data-frame')) > first,
    'Projection interrupted capture clock',
  );
  await operator.getByRole('button', { name: 'Stop input', exact: true }).click();
  await page.locator('.sc-input-fallback').waitFor();
  assert.equal(
    await page.locator('.sc-input-fallback').evaluate((el) => getComputedStyle(el).backgroundColor),
    'rgb(0, 0, 0)',
  );
  await operator.locator('.sc-output-settings summary').click();
  await operator.getByLabel('On input loss').selectOption('ambient');
  await page.locator('.sc-input-fallback').waitFor({ state: 'detached' });
  await operator.getByLabel('Show calibration pattern').uncheck();
  await operator.getByRole('button', { name: 'Save scene', exact: true }).click();
  await operator.locator('.sc-scene-pads button').first().waitFor();
  const saved = (await readdir(root)).find((name) => name.startsWith('saved-scene-'))!;
  assert(
    !(await readFile(join(root, saved, 'live.yaml'), 'utf8')).includes('projection:'),
    'Venue geometry leaked into scene',
  );
  await loadLiveProject(join(root, saved));
  await operator.getByRole('button', { name: 'Start input', exact: true }).click();
  await page.locator('[data-input-available=true]').waitFor();
  const kept = await page.locator('iframe').evaluate((el) => el.style.transform);
  await operator.locator('.sc-scene-pads button').first().click();
  await operator.locator('.sc-scene-pads button[aria-pressed=true]').waitFor();
  assert.equal(await page.locator('iframe').evaluate((el) => el.style.transform), kept);
  await operator.getByLabel('Enable projection correction').uncheck();
  await page.locator('iframe').waitFor({ state: 'detached' });
  await page.locator('.sc-live-scene[data-ready=true] .sc-stage').waitFor();
  await checkPersistedVenue(page);

  await page.screenshot({ path: join(out, 'scene.png') });
  assert.deepEqual(errors, []);
  process.stdout.write(
    'Projection: PASS (geometry, artwork alignment, crop, masks, calibration, blackout, profiles, snapshots)\n',
  );
} finally {
  releaseFont();
  await browser.close();
  await server.close();
  await rm(root, { recursive: true, force: true });
}

async function checkVenues(page: Page, operator: Page) {
  await operator.getByLabel('Venue name', { exact: true }).fill('Warehouse');
  await operator.getByRole('button', { name: 'Save venue', exact: true }).click();
  // Downloads belong to the window that created the Blob URL, the output window.
  const outputDownload = page.waitForEvent('download');
  await operator.getByRole('button', { name: 'Export venue', exact: true }).click();
  const exported = await outputDownload;
  await exported.saveAs(join(out, 'venue.json'));
  const venue = VenueSchema.parse(JSON.parse(await readFile(join(out, 'venue.json'), 'utf8')));
  assert.equal(venue.projection.corners[0][0], 0.121);
  await operator.getByRole('button', { name: 'Reset geometry', exact: true }).click();
  await operator.getByLabel('Load saved venue').selectOption('Warehouse');
  assert.equal(await operator.getByLabel('Top-left X', { exact: true }).inputValue(), '12.1');
  assert.equal(await operator.getByLabel('Show calibration pattern').isChecked(), false);
  await operator.getByRole('button', { name: 'Reset geometry', exact: true }).click();
  await operator.getByLabel('Import venue').setInputFiles(join(out, 'venue.json'));
  await operator.waitForFunction(
    () => document.querySelector<HTMLInputElement>('[aria-label="Top-left X"]')?.value === '12.1',
  );
  const before = await page.locator('iframe').evaluate((el) => el.style.transform);
  await operator.getByLabel('Import venue').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        ...venue,
        projection: {
          ...venue.projection,
          corners: [
            [0, 0],
            [0, 0],
            [0, 0],
            [0, 0],
          ],
        },
      }),
    ),
  });
  await operator.getByText(/Projection corners must form/).waitFor();
  assert.equal(await page.locator('iframe').evaluate((el) => el.style.transform), before);
  assert.match(
    await page.evaluate(() => localStorage.getItem('setcast-venues-v1') ?? ''),
    /Warehouse/,
  );
}

async function dragCorner(operator: Page) {
  const handle = operator.getByLabel('Move Top-left corner', { exact: true });
  await handle.scrollIntoViewIfNeeded();
  const box = (await handle.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await operator.mouse.move(x, y);
  await operator.mouse.down();
  await operator.mouse.move(x + 15, y + 10, { steps: 3 });
  await operator.mouse.up();
  assert(Number(await operator.getByLabel('Top-left X', { exact: true }).inputValue()) > 12.1);
  await operator.getByLabel('Top-left X', { exact: true }).fill('12.1');
  await operator.getByLabel('Top-left Y', { exact: true }).fill('15');
}

async function assertBlack(page: Page) {
  const png = await page.screenshot({ path: join(out, 'blackout.png') });
  const max = await page.evaluate(async (data) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + data;
    await img.decode();
    const canvas = new OffscreenCanvas(img.width, img.height);
    const context = canvas.getContext('2d')!;
    context.drawImage(img, 0, 0);
    const pixels = context.getImageData(0, 0, img.width, img.height).data;
    let maximum = 0;
    for (let index = 0; index < pixels.length; index++)
      if (index % 4 !== 3) maximum = Math.max(maximum, pixels[index]!);
    return maximum;
  }, png.toString('base64'));
  assert.equal(max, 0, 'Blackout left visible calibration pixels');
}

async function checkPersistedVenue(page: Page) {
  const fresh = await page.context().newPage();
  try {
    await fresh.goto(server.url);
    await fresh.locator('.sc-projection-settings summary').click();
    assert.equal(await fresh.getByLabel('Enable projection correction').isChecked(), false);
    await fresh.getByLabel('Load saved venue').selectOption('Warehouse');
    assert.equal(await fresh.getByLabel('Enable projection correction').isChecked(), true);
    assert.equal(await fresh.getByLabel('Show calibration pattern').isChecked(), false);
    assert.equal(await fresh.getByLabel('Top-left X', { exact: true }).inputValue(), '12.1');
  } finally {
    await fresh.close();
  }
}
