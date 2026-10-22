import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { loadProject } from '@setcast/core/node';
import { themes } from '../../themes/src/index.ts';
import { createFixture, fixtureProject } from '../../../scripts/export-acceptance/fixture.ts';
import { play } from '../src/index.ts';

const root = await mkdtemp(join(tmpdir(), 'setcast-recorded-check-'));
const out = resolve('examples/demo/out/recorded-player-check');
await mkdir(out, { recursive: true });
await createFixture(root);
const original = await readFile(join(root, 'setcast.yaml'), 'utf8');
const project = await fixtureProject(root, 'sterile-tech');
const server = await play(project, {
  projectDir: root,
  port: 0,
  themes: { choices: Object.values(themes), load: (theme) => fixtureProject(root, theme) },
});
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(server.url);
  await page.getByRole('button', { name: 'Play (Space)', exact: true }).click();
  await page.waitForFunction(
    () => Number(document.querySelector('main')?.getAttribute('data-frame')) > 15,
  );
  await page.getByRole('button', { name: 'Pause (Space)', exact: true }).click();
  await page.getByRole('button', { name: 'Play (Space)', exact: true }).waitFor();
  const paused = await page.locator('main').getAttribute('data-frame');
  await page.waitForTimeout(150);
  assert.equal(await page.locator('main').getAttribute('data-frame'), paused);
  await page.getByLabel('Seek', { exact: true }).fill('2');
  await page.waitForFunction(
    () => Number(document.querySelector('main')?.getAttribute('data-frame')) >= 60,
  );
  await page.getByRole('button', { name: 'Tracklist', exact: true }).click();
  await page.getByRole('button', { name: /Change the theme/ }).click();
  await page.getByRole('button', { name: 'darkroom', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.locator('.theme-darkroom').waitFor();
  await page.locator('input[type=file]').setInputFiles(join(root, 'art.svg'));
  const response = page.waitForResponse((response) => response.url().endsWith('/save'));
  await page.getByRole('button', { name: 'Save scene', exact: true }).click();
  const saved = await (await response).json();
  assert(saved.directory, JSON.stringify(saved));
  const restored = await loadProject(join(root, saved.directory), {
    probeDuration: async () => 3.1415,
  });
  assert.equal(restored.project.theme, 'darkroom');
  assert.equal(restored.project.panel, null);
  assert(restored.project.tracklist);
  assert(restored.project.background);
  assert.equal(await readFile(join(root, 'setcast.yaml'), 'utf8'), original);
  await page.waitForTimeout(1800);
  assert(
    (await page.getByRole('status').innerText()).includes(saved.directory),
    'Save confirmation disappeared',
  );
  await page.screenshot({ path: join(out, 'saved-scene.png') });
  await page.getByRole('button', { name: 'Play (Space)', exact: true }).click();
  await page.getByRole('button', { name: 'Pause (Space)', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Play (Space)', exact: true }).waitFor();
  assert.equal(Number(await page.locator('main').getAttribute('data-frame')), 94);
  assert(Number(await page.locator('main').getAttribute('data-windows')) <= 2);
  assert.equal(errors.length, 0, errors.join('\n'));
  process.stdout.write(
    'Recorded player: PASS (play/pause/seek, theme/art/credits, persisted save, finite end)\n',
  );
} catch (error) {
  await page.screenshot({ path: join(out, 'failure.png') });
  throw error;
} finally {
  await browser.close();
  await server.close();
  await rm(root, { recursive: true, force: true });
}
