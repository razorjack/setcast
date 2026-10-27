import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { type Page } from 'playwright';
import { loadLiveProject } from '@setcast/core/node';
import { readSession, replayEvents } from '@setcast/core';
import { play } from '../src/index.ts';
import { launchLiveBrowser, pageErrors, writeFixture } from './live-harness.ts';

const root = await writeFixture('sequence', {
  'theme.css': '.setcast { background: #09212b; color: white; }',
  'live.yaml': `theme: ./theme.css
bpm: 120
output: {width: 960, height: 540, fps: 30}
sequence:
  scenes:
    - {preset: saved-scene-a, seconds: 5}
    - {preset: saved-scene-b, seconds: 5}
`,
  ...savedScene('a', '#173e42'),
  ...savedScene('b', '#402b51'),
  ...savedScene('broken', '#aa0000', 'background: broken.svg\n'),
  'saved-scene-broken/broken.svg': 'invalid SVG',
});
const out = resolve('examples/demo/out/sequence-check');
await mkdir(out, { recursive: true });
const { project } = await loadLiveProject(root);
const server = await play(project, { projectDir: root, port: 0 });
const browser = await launchLiveBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  const errors = pageErrors(page);
  await page.goto(server.url);
  await page.getByRole('button', { name: 'Start input', exact: true }).click();
  await page.locator('[data-input-available=true]').waitFor();
  await page.locator('.sc-live-journal summary').click();
  await page.getByRole('button', { name: 'Start journal', exact: true }).click();
  await page.getByRole('button', { name: 'Finish journal', exact: true }).waitFor();
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Operator window', exact: true }).click();
  const operator = await popup;
  await operator.locator('.sc-sequence summary').click();
  await operator.getByRole('button', { name: 'Run sequence', exact: true }).click();
  await atScene(operator, 0);
  const first = Number(await page.locator('main').getAttribute('data-frame'));
  await atScene(operator, 1);
  assert(Number(await page.locator('main').getAttribute('data-frame')) > first + 120);
  await operator.getByRole('button', { name: 'Hold sequence', exact: true }).click();
  await operator.waitForTimeout(6000);
  assert.equal(await operator.locator('.sc-sequence').getAttribute('data-index'), '1');
  await operator.getByRole('button', { name: 'Run sequence', exact: true }).click();
  await atScene(operator, 0);
  await operator.getByRole('button', { name: 'Hold sequence', exact: true }).click();
  await operator.getByRole('button', { name: 'Next scene', exact: true }).click();
  await atScene(operator, 1);
  assert.equal(await operator.locator('.sc-sequence').getAttribute('data-running'), 'false');
  await operator.getByRole('button', { name: 'Run sequence', exact: true }).click();
  await operator.locator('.sc-scene-pads button').filter({ hasText: 'Scene a' }).click();
  await operator
    .locator('.sc-scene-pads button[aria-pressed=true]')
    .filter({ hasText: 'Scene a' })
    .waitFor();
  assert.equal(await operator.locator('.sc-sequence').getAttribute('data-running'), 'false');
  await checkFailure(operator);
  await operator.screenshot({ path: join(out, 'operator.png'), fullPage: true });
  await page.screenshot({ path: join(out, 'output.png') });
  await operator.locator('.sc-live-journal summary').click();
  await operator.getByRole('button', { name: 'Finish journal', exact: true }).click();
  await operator.getByText(/^Saved to /).waitFor();
  await verifyJournal();
  await operator.getByRole('button', { name: 'Stop input', exact: true }).click();
  await operator.getByRole('button', { name: 'Start input', exact: true }).click();
  await page.locator('[data-input-available=true]').waitFor();
  assert.equal(await operator.locator('.sc-sequence').getAttribute('data-running'), 'false');
  assert.equal(await operator.locator('.sc-sequence').getAttribute('data-index'), '-1');
  assert.deepEqual(errors, []);
  process.stdout.write(
    'Sequence: PASS (dwell, loop, hold/skip, manual takeover, failure, journal and restart)\n',
  );
} finally {
  await browser.close();
  await server.close();
  await rm(root, { recursive: true, force: true });
}

async function atScene(operator: Page, index: number) {
  await operator.locator(`.sc-sequence[data-index="${index}"][data-pending=false]`).waitFor();
}
async function checkFailure(operator: Page) {
  await operator.getByLabel('Add sequence scene').selectOption('saved-scene-broken');
  await operator.getByRole('button', { name: 'Move scene 3 up', exact: true }).click();
  await operator.getByRole('button', { name: 'Move scene 2 up', exact: true }).click();
  await operator.getByRole('button', { name: 'Next scene', exact: true }).click();
  await operator.getByText(/Cannot prepare this scene/).waitFor();
  await operator.locator('.sc-sequence[data-pending=false]').waitFor();
  assert.equal(await operator.locator('.sc-sequence').getAttribute('data-running'), 'false');
  assert.equal(
    await operator.locator('.sc-scene-pads button[aria-pressed=true]').innerText(),
    '1\nScene a',
  );
}
async function verifyJournal() {
  const file = (await readdir(root)).find((name) => name.endsWith('.jsonl'))!;
  const journal = readSession(await readFile(join(root, file), 'utf8'));
  const scenes = journal.events.filter((event) => event.type === 'scene');
  assert(scenes.length >= 4, 'Automatic recalls did not enter the journal');
  for (const event of scenes) {
    const yaml = await readFile(join(root, event.preset, 'live.yaml'), 'utf8');
    assert(!yaml.includes('Scene broken'), 'Failed scene entered journal');
    assert(!yaml.includes('sequence:'), 'Session sequence leaked into scene snapshot');
    await loadLiveProject(join(root, event.preset));
  }
  const replay = replayEvents(journal.header, journal.events, 0, 120);
  assert(replay.automation.some((event) => event.to.brightness === 0));
}

function savedScene(name: string, color: string, extra = '') {
  return {
    [`saved-scene-${name}/theme.css`]: `.setcast { background: ${color}; color: white; }`,
    [`saved-scene-${name}/live.yaml`]: `theme: ./theme.css\ntitle: Scene ${name}\n${extra}`,
  };
}
