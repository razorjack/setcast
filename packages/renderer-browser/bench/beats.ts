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
    setBeatLevel: (level: number) => void;
  }
}
const root = await mkdtemp(join(tmpdir(), 'setcast-beats-'));
const out = resolve('examples/demo/out/beat-check');
await mkdir(out, { recursive: true });
await writeFile(join(root, 'theme.css'), '.setcast {background:#172226;color:white}');
await writeFile(
  join(root, 'live.yaml'),
  'theme: ./theme.css\nbpm: 135\noutput: {width: 640, height: 360, fps: 30}\n',
);
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
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index++) {
      const phase = (index / context.sampleRate) % 0.5;
      samples[index] =
        phase < 0.04 ? Math.sin(2 * Math.PI * 80 * phase) * Math.exp(-phase * 80) : 0;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = context.createGain();
    const destination = context.createMediaStreamDestination();
    source.connect(gain).connect(destination);
    source.start();
    window.setBeatLevel = (level) => {
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
  await page.locator('.sc-beat-tracking summary').click();
  await page.getByLabel('Estimate beats from input').check();
  await page.locator('[data-beat-state=locked]').waitFor();
  assert.equal(await page.getByLabel('Tempo (BPM)', { exact: true }).inputValue(), '135');
  await page.screenshot({ path: join(out, 'operator.png'), fullPage: true });
  await page.evaluate(() => window.setBeatLevel(0));
  await page.locator('[data-beat-state=uncertain]').waitFor();
  assert(await page.getByRole('button', { name: 'Use detected beat grid' }).isDisabled());
  await page.evaluate(() => window.setBeatLevel(1));
  await page.locator('[data-beat-state=locked]').waitFor();
  await page.getByRole('button', { name: 'Use detected beat grid' }).click();
  await page.locator('[data-beat-state=off]').waitFor();
  assert(
    Math.abs(Number(await page.getByLabel('Tempo (BPM)', { exact: true }).inputValue()) - 120) < 1,
  );
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'Finish journal', exact: true }).click();
  await checkJournal();
  await page.getByLabel('Tempo (BPM)', { exact: true }).fill('140');
  await page.getByLabel('Estimate beats from input').check();
  await page.getByRole('button', { name: 'Stop input', exact: true }).click();
  await page.locator('[data-beat-state=listening]').waitFor();
  await page.getByRole('button', { name: 'Start input', exact: true }).click();
  await page.locator('[data-beat-state=locked]').waitFor();
  assert.equal(await page.getByLabel('Tempo (BPM)', { exact: true }).inputValue(), '140');
  await page.getByLabel('Minimum detected BPM').fill('200');
  await page.locator('[data-beat-state=listening]').waitFor();
  assert(await page.getByRole('button', { name: 'Use detected beat grid' }).isDisabled());
  assert.deepEqual(errors, []);
  process.stdout.write(
    'Beats: PASS (live PCM, confidence loss, explicit adoption, journal, manual tempo and restart)\n',
  );
} catch (error) {
  await page.screenshot({ path: join(out, 'failure.png'), fullPage: true });
  throw error;
} finally {
  await browser.close();
  await server.close();
  await rm(root, { recursive: true, force: true });
}
async function checkJournal() {
  const journal = (await readdir(root)).find((name) => name.endsWith('.jsonl'))!;
  const { events } = readSession(await readFile(join(root, journal), 'utf8'));
  const scenes = events.filter((event) => event.type === 'scene');
  assert.equal(
    scenes.length,
    2,
    'Only the initial grid and explicitly accepted grid are journaled',
  );
  const { project: saved } = await loadLiveProject(join(root, scenes[1]!.preset));
  assert(Math.abs(saved.bpm! - 120) < 1);
  assert(Number.isFinite(saved.beatOffset));
}
