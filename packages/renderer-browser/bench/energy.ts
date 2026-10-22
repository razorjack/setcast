import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { loadLiveProject } from '@setcast/core/node';
import { readSession } from '@setcast/core';
import { play } from '../src/index.ts';

declare global {
  interface Window {
    setTestEnergy: (gain: number) => void;
  }
}
const root = await mkdtemp(join(tmpdir(), 'setcast-energy-'));
const out = resolve('examples/demo/out/energy-check');
await mkdir(out, { recursive: true });
await writeFile(join(root, 'theme.css'), '.setcast {background:#172226;color:white}');
await writeFile(
  join(root, 'live.yaml'),
  `theme: ./theme.css
output: {width: 640, height: 360, fps: 30}
sequence:
  mode: energy
  energy: {smooth: 0.1, sustain: 1}
  scenes:
    - {preset: saved-scene-low, seconds: 5, energy: low}
    - {preset: saved-scene-high, seconds: 5, energy: high}
`,
);
for (const name of ['low', 'high']) {
  const path = join(root, `saved-scene-${name}`);
  await mkdir(path);
  await writeFile(
    join(path, 'theme.css'),
    `.setcast {background:${name === 'low' ? '#173e42' : '#402b51'};color:white}`,
  );
  await writeFile(join(path, 'live.yaml'), `title: ${name}\ntheme: ./theme.css\n`);
}
const { project } = await loadLiveProject(root);
const server = await play(project, { projectDir: root, port: 0 });
const browser = await chromium.launch({
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.addInitScript(() => {
  navigator.mediaDevices.getUserMedia = async () => {
    const context = new AudioContext();
    await context.resume();
    const oscillator = context.createOscillator();
    oscillator.frequency.value = 60;
    const gain = context.createGain();
    gain.gain.value = 0.001;
    const destination = context.createMediaStreamDestination();
    oscillator.connect(gain).connect(destination);
    oscillator.start();
    window.setTestEnergy = (level) => {
      gain.gain.value = level;
    };
    return destination.stream;
  };
});
try {
  await page.goto(server.url);
  await page.getByRole('button', { name: 'Start input', exact: true }).click();
  await page.locator('[data-input-available=true]').waitFor();
  await page.locator('.sc-live-journal summary').click();
  await page.getByRole('button', { name: 'Start journal', exact: true }).click();
  await page.getByRole('button', { name: 'Finish journal', exact: true }).waitFor();
  await page.locator('.sc-sequence > summary').click();
  await page.locator('[data-energy-band=low]').waitFor();
  await page.getByRole('button', { name: 'Run sequence', exact: true }).click();
  await atScene(0);
  await page.evaluate(() => window.setTestEnergy(0.9));
  await page.waitForTimeout(200);
  await page.evaluate(() => window.setTestEnergy(0.001));
  await page.waitForTimeout(500);
  assert.equal(await page.locator('.sc-sequence').getAttribute('data-index'), '0');
  await page.evaluate(() => window.setTestEnergy(0.9));
  await page.locator('[data-energy-band=high]').waitFor();
  await atScene(1);
  await page.getByRole('button', { name: 'Hold sequence', exact: true }).click();
  await page.evaluate(() => window.setTestEnergy(0.001));
  await page.locator('[data-energy-band=low]').waitFor();
  await page.waitForTimeout(5500);
  assert.equal(await page.locator('.sc-sequence').getAttribute('data-index'), '1');
  await page.getByRole('button', { name: 'Run sequence', exact: true }).click();
  await atScene(0);
  await page.getByRole('button', { name: 'Hold sequence', exact: true }).click();
  await page.screenshot({ path: join(out, 'operator.png'), fullPage: true });
  await checkExport();
  await page.getByRole('button', { name: 'Finish journal', exact: true }).click();
  await page.getByText(/^Saved to /).waitFor();
  const journal = (await readdir(root)).find((name) => name.endsWith('.jsonl'))!;
  const { events } = readSession(await readFile(join(root, journal), 'utf8'));
  assert(events.filter((event) => event.type === 'scene').length >= 3);
  await page.getByRole('button', { name: 'Stop input', exact: true }).click();
  await page.locator('[data-energy-band=listening]').waitFor();
  assert.equal(await page.locator('.sc-sequence').getAttribute('data-running'), 'false');
  assert.deepEqual(errors, []);
  process.stdout.write(
    'Energy: PASS (synthetic input, transient rejection, sustained selection, hold, export and journal)\n',
  );
} catch (error) {
  await page.screenshot({ path: join(out, 'failure.png'), fullPage: true });
  throw error;
} finally {
  await browser.close();
  await server.close();
  await rm(root, { recursive: true, force: true });
}
async function atScene(index: number) {
  await page.locator(`.sc-sequence[data-index="${index}"][data-pending=false]`).waitFor();
}
async function checkExport() {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export sequence', exact: true }).click();
  const path = await (await download).path();
  const saved = JSON.parse(await readFile(path!, 'utf8')).sequence;
  assert.equal(saved.mode, 'energy');
  assert.equal(saved.energy.sustain, 1);
  assert.equal(saved.scenes[1].energy, 'high');
}
