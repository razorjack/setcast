import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { type Page } from 'playwright';
import { loadLiveProject } from '@setcast/core/node';
import { TestPatternPresetSchema } from '@setcast/core';
import { play } from '../src/index.ts';
import { launchLiveBrowser, pageErrors, writeFixture } from './live-harness.ts';

const out = resolve('examples/demo/out/camera-check');
await mkdir(out, { recursive: true });
await checkCamera(false);
await checkCamera(true);
process.stdout.write(
  `Camera setup: PASS (patterns, motion, output protection, projection, presets, scenes, portrait). ${out}\n`,
);

async function checkCamera(portrait: boolean) {
  const root = await fixture(portrait);
  const { project } = await loadLiveProject(root);
  const server = await play(project, { projectDir: root, port: 0 });
  const browser = await launchLiveBrowser();
  try {
    const page = await browser.newPage({
      viewport: portrait ? { width: 700, height: 1100 } : { width: 1280, height: 900 },
    });
    const errors = pageErrors(page);
    await page.goto(server.url);
    assert.equal(
      await page.locator('.sc-test-pattern').count(),
      0,
      'YAML activated a pattern without the operator',
    );
    const popup = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Operator window', exact: true }).click();
    const operator = await popup;
    await configure(operator);
    await page.locator('.sc-test-pattern[data-pattern=grayscale]').waitFor();
    await patterns(page, operator, portrait);
    if (!portrait) {
      await protection(page, operator);
      await motion(page, operator);
      await projection(page, operator);
      await presets(page, operator);
      await sceneIsolation(page, operator, root);
    }
    await operator.screenshot({
      path: join(out, portrait ? 'operator-portrait.png' : 'operator.png'),
      fullPage: true,
    });
    assert.deepEqual(errors, [], 'Camera setup raised browser errors');
  } finally {
    await browser.close();
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
}

function fixture(portrait: boolean) {
  return writeFixture('camera', {
    'theme.css': '.setcast {background:#194847;color:white;}',
    'live.yaml': `theme: ./theme.css
title: Camera fixture
output: {width: ${portrait ? 540 : 960}, height: ${portrait ? 960 : 540}, fps: 30}
testPattern: {pattern: grayscale, level: 0.8, detailSize: 3}
`,
  });
}

async function configure(operator: Page) {
  await operator.locator('.sc-output-settings summary').click();
  await operator.getByLabel('On input loss').selectOption('ambient');
  await operator.locator('.sc-test-pattern-settings summary').click();
  assert.equal(await operator.getByLabel('Pattern level', { exact: true }).inputValue(), '0.8');
  await operator.getByLabel('Show test pattern', { exact: true }).check();
}

async function patterns(page: Page, operator: Page, portrait: boolean) {
  for (const pattern of ['alignment', 'grayscale', 'detail', 'motion']) {
    await operator.getByLabel('Test image', { exact: true }).selectOption(pattern);
    await page.locator(`.sc-test-pattern[data-pattern=${pattern}]`).waitFor();
    await page
      .locator('.sc-player-canvas')
      .screenshot({ path: join(out, `${pattern}${portrait ? '-portrait' : ''}.png`) });
  }
  await operator.getByLabel('Test image', { exact: true }).selectOption('grayscale');
  const first = await page.locator('.sc-player-canvas').screenshot();
  await page.waitForTimeout(150);
  assert.deepEqual(
    await page.locator('.sc-player-canvas').screenshot(),
    first,
    'Static pattern changed without input',
  );
}

async function protection(page: Page, operator: Page) {
  await operator.getByLabel('On input loss').selectOption('black');
  await assertBlack(page, 'input-loss');
  await operator.getByLabel('On input loss').selectOption('ambient');
  await operator.getByRole('button', { name: 'Blackout', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector<SVGElement>('.sc-test-pattern > svg')?.style.opacity === '0',
  );
  await assertBlack(page, 'blackout');
  await operator.getByRole('button', { name: 'Restore output', exact: true }).click();
  await operator.getByLabel('Brightness', { exact: true }).press('Home');
  await page.waitForFunction(
    () => document.querySelector<SVGElement>('.sc-test-pattern > svg')?.style.opacity === '0',
  );
  await assertBlack(page, 'brightness-zero');
  await operator.getByLabel('Brightness', { exact: true }).press('End');
}

async function motion(page: Page, operator: Page) {
  await operator.getByRole('button', { name: 'Start input', exact: true }).click();
  await page.locator('main[data-input-available=true]').waitFor();
  await operator.getByLabel('Test image', { exact: true }).selectOption('motion');
  const before = await page.locator('.sc-test-motion').getAttribute('x');
  await page.waitForFunction(
    (before) => document.querySelector('.sc-test-motion')?.getAttribute('x') !== before,
    before,
  );
  await operator.getByLabel('Pattern speed (cycles/s)', { exact: true }).press('Home');
  const stopped = await page.locator('.sc-test-motion').getAttribute('x');
  const frame = Number(await page.locator('main').getAttribute('data-frame'));
  await page.waitForFunction(
    (frame) => Number(document.querySelector('main')?.getAttribute('data-frame')) > frame + 10,
    frame,
  );
  assert.equal(
    await page.locator('.sc-test-motion').getAttribute('x'),
    stopped,
    'Speed 0 did not freeze motion',
  );
  await operator.getByLabel('Show test pattern', { exact: true }).uncheck();
  await page.locator('.sc-test-pattern').waitFor({ state: 'detached' });
  await operator.getByLabel('Show test pattern', { exact: true }).check();
}

async function projection(page: Page, operator: Page) {
  await operator.locator('.sc-projection-settings summary').click();
  await operator.getByLabel('Enable projection correction', { exact: true }).check();
  const frame = page.frameLocator('iframe[title="Projected scene"]');
  await frame.locator('.sc-test-pattern[data-pattern=motion]').waitFor();
  await operator.getByLabel('Show calibration pattern', { exact: true }).check();
  await frame.locator('.sc-test-pattern[data-pattern=alignment]').waitFor();
  assert.equal(await operator.getByLabel('Test image', { exact: true }).inputValue(), 'alignment');
  await operator.getByLabel('Top-left X', { exact: true }).fill('10');
  const dimensions = await frame.locator('.sc-test-pattern').evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return [bounds.width, bounds.height];
  });
  assert.deepEqual(dimensions, [960, 540], 'Projection changed pattern coordinates');
  await operator.getByRole('button', { name: 'Blackout', exact: true }).click();
  const projected = await (await page
    .locator('iframe[title="Projected scene"]')
    .elementHandle())!.contentFrame();
  await projected!.waitForFunction(
    () => document.querySelector<SVGElement>('.sc-test-pattern > svg')?.style.opacity === '0',
  );
  await assertBlack(page, 'projection-blackout');
  await operator.getByRole('button', { name: 'Restore output', exact: true }).click();
  await operator.getByLabel('Enable projection correction', { exact: true }).uncheck();
  await page.locator('.sc-test-pattern[data-pattern=alignment]').waitFor();
}

async function presets(page: Page, operator: Page) {
  const download = page.waitForEvent('download');
  await operator.getByRole('button', { name: 'Export test pattern settings', exact: true }).click();
  const file = join(out, 'preset.json');
  await (await download).saveAs(file);
  const preset = TestPatternPresetSchema.parse(JSON.parse(await readFile(file, 'utf8')));
  assert.equal(preset.testPattern.pattern, 'alignment');
  await operator.getByLabel('Import test pattern settings', { exact: true }).setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version":2,"testPattern":{}}'),
  });
  await operator.getByText(/Cannot import test pattern preset:/).waitFor();
  assert(
    await operator.getByLabel('Show test pattern', { exact: true }).isChecked(),
    'Invalid import changed activation',
  );
  await operator.getByLabel('Import test pattern settings', { exact: true }).setInputFiles(file);
  await page.locator('.sc-test-pattern').waitFor({ state: 'detached' });
  assert(
    !(await operator.getByLabel('Show test pattern', { exact: true }).isChecked()),
    'Import activated output',
  );
}

async function sceneIsolation(page: Page, operator: Page, root: string) {
  await operator.getByRole('button', { name: 'Save scene', exact: true }).click();
  await operator.locator('.sc-scene-pads button').first().waitFor();
  const directory = (await readdir(root)).find((name) => name.startsWith('saved-scene-'))!;
  assert(
    !(await readFile(join(root, directory, 'live.yaml'), 'utf8')).includes('testPattern:'),
    'Output settings leaked into scene',
  );
  await operator.getByLabel('Show test pattern', { exact: true }).check();
  await operator.locator('.sc-scene-pads button').first().click();
  await operator.locator('.sc-scene-pads button[aria-pressed=true]').waitFor();
  await operator.waitForFunction(() => {
    const button = document.querySelector<HTMLButtonElement>(
      '.sc-scene-pads button[aria-pressed=true]',
    );
    return button && !button.disabled && !button.textContent?.includes('Queued');
  });
  assert.equal(
    await page.locator('.sc-test-pattern').getAttribute('data-pattern'),
    'alignment',
    'Scene recall replaced output setup',
  );
}

async function assertBlack(page: Page, name: string) {
  const file = join(out, `${name}.png`);
  await page.locator('.sc-player-canvas').screenshot({ path: file });
  const decoded = spawnSync(
    'ffmpeg',
    ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
    { maxBuffer: 32 * 1024 * 1024 },
  );
  assert.equal(decoded.status, 0, decoded.stderr.toString());
  assert(
    decoded.stdout.every((level) => level < 8),
    `${name} did not cover the pattern with black`,
  );
}
