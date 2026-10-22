import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { loadLiveProject } from '@setcast/core/node';
import { readSession, replayEvents } from '@setcast/core';
import { themes } from '../../themes/src/index.ts';
import { play } from '../src/index.ts';

declare global {
  interface Window {
    emitMidi: (bytes: number[]) => void;
  }
}
const out = resolve('examples/demo/out/performance-check');
await mkdir(out, { recursive: true });
const root = await mkdtemp(join(tmpdir(), 'setcast-performance-'));
await writeFile(
  join(root, 'live.yaml'),
  'theme: darkroom\ntitle: Backdrop\nbpm: 120\noutput: {width: 960, height: 540, fps: 30}\n',
);
const { project } = await loadLiveProject(root, { themes });
const server = await play(project, {
  projectDir: root,
  port: 0,
  themes: {
    choices: Object.values(themes),
    load: async (theme) => (await loadLiveProject(root, { themes, theme })).project,
  },
});
const browser = await chromium.launch({
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.addInitScript(() => {
  const input = Object.assign(new EventTarget(), {
    id: 'fixture',
    name: 'Fixture MIDI',
    state: 'connected',
    close: async () => {},
  });
  const access = Object.assign(new EventTarget(), { inputs: new Map([['fixture', input]]) });
  Object.defineProperty(navigator, 'requestMIDIAccess', { value: async () => access });
  window.emitMidi = (bytes) => {
    const event = new Event('midimessage');
    Object.defineProperty(event, 'data', { value: new Uint8Array(bytes) });
    input.dispatchEvent(event);
  };
});
try {
  await page.goto(server.url);
  await page.getByRole('button', { name: 'Start input', exact: true }).click();
  await page.locator('[data-capture="running"]').waitFor();
  await page.getByRole('button', { name: 'Save scene', exact: true }).click();
  await page.getByRole('button', { name: /Backdrop/ }).waitFor();
  await page.getByLabel('Theme', { exact: true }).selectOption('sterile-tech');
  await page.getByLabel('Title', { exact: true }).fill('Projection');
  await page.waitForFunction(() =>
    document.querySelector('.sc-live-scene[data-ready="true"] .theme-sterile-tech'),
  );
  await page.getByRole('button', { name: 'Save scene', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.sc-scene-pads button').length === 2);
  await page.getByText('Session journal', { exact: true }).click();
  await page.getByRole('button', { name: 'Start journal', exact: true }).click();
  await page.getByRole('button', { name: 'Finish journal', exact: true }).waitFor();
  await page.getByLabel('Brightness', { exact: true }).fill('0.6');
  await page.getByLabel('Brightness', { exact: true }).dispatchEvent('pointerup');
  await page.waitForFunction(
    () =>
      Number(
        document.querySelector<HTMLElement>('.sc-live-scene[data-ready="true"] .sc-output-dimmer')
          ?.style.opacity,
      ) > 0.39,
  );
  await page.getByRole('button', { name: 'Blackout', exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLElement>('.sc-live-scene[data-ready="true"] .sc-output-dimmer')
        ?.style.opacity === '1',
  );
  await page.getByRole('button', { name: 'Restore output', exact: true }).click();
  const pads = page.locator('.sc-scene-pads button');
  await pads.filter({ hasText: 'Backdrop' }).click();
  await page.getByRole('button', { name: 'Cancel transition', exact: true }).waitFor();
  await page
    .getByRole('button', { name: 'Cancel transition', exact: true })
    .waitFor({ state: 'hidden' });
  await page.waitForFunction(() =>
    document.querySelector('.sc-live-scene[data-ready="true"] .theme-darkroom'),
  );
  assert.equal(await page.getByLabel('Tempo (BPM)', { exact: true }).inputValue(), '120');
  await page.getByText('MIDI controls', { exact: true }).click();
  await page.getByRole('button', { name: 'Connect MIDI', exact: true }).click();
  await page.getByLabel('MIDI input', { exact: true }).selectOption('fixture');
  await page.waitForFunction(
    () => !(document.querySelector('input[aria-label="Intensity"]') as HTMLInputElement)?.disabled,
  );
  await page.evaluate(() => window.emitMidi([0xb0, 1, 127]));
  await page.waitForFunction(
    () =>
      (document.querySelector('input[aria-label="Intensity"]') as HTMLInputElement)?.value === '2',
  );
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Operator window', exact: true }).click();
  const operator = await popupPromise;
  await operator.getByRole('button', { name: 'Blackout', exact: true }).waitFor();
  await page.evaluate(() => window.emitMidi([0x90, 44, 127]));
  await operator.getByRole('button', { name: 'Restore output', exact: true }).waitFor();
  await page.evaluate(() => window.emitMidi([0x90, 44, 0]));
  assert(await operator.getByRole('button', { name: 'Restore output', exact: true }).isVisible());
  await page.evaluate(() => window.emitMidi([0x90, 44, 127]));
  await operator.getByRole('button', { name: 'Blackout', exact: true }).waitFor();
  const broken = join(root, 'saved-scene-broken');
  await mkdir(broken);
  await writeFile(
    join(broken, 'live.yaml'),
    'theme: ./broken.css\nbackground: broken.svg\ntitle: Broken scene\n',
  );
  await writeFile(join(broken, 'broken.css'), '.setcast { background: red; }');
  await writeFile(join(broken, 'broken.svg'), 'not an image');
  await operator.getByRole('button', { name: 'Refresh scenes', exact: true }).click();
  await operator.locator('.sc-scene-pads button').filter({ hasText: 'Broken scene' }).click();
  await operator.getByText(/Cannot prepare this scene/).waitFor();
  assert(
    await page.locator('.sc-live-scene[data-ready="true"] .theme-darkroom').count(),
    'Failed scene replaced the working output',
  );
  assert.equal(
    await operator
      .locator('.sc-scene-pads button')
      .filter({ hasText: 'Backdrop' })
      .getAttribute('aria-pressed'),
    'true',
    'Failed scene changed the active pad',
  );
  await operator.getByRole('button', { name: 'Dismiss notice', exact: true }).click();
  await rm(broken, { recursive: true, force: true });
  await operator.getByRole('button', { name: 'Refresh scenes', exact: true }).click();
  await operator.screenshot({ path: join(out, 'operator.png') });
  await page.screenshot({ path: join(out, 'output.png') });
  await operator.locator('.sc-live-journal summary').click();
  await operator.getByRole('button', { name: 'Finish journal', exact: true }).click();
  await operator.waitForTimeout(1000);
  const file = (
    await operator.locator('.sc-live-journal p').filter({ hasText: 'Saved to ' }).innerText()
  ).replace('Saved to ', '');
  const journal = readSession(await readFile(join(root, file), 'utf8'));
  assert(journal.events.filter((event) => event.type === 'performance').length >= 7);
  assert(journal.events.filter((event) => event.type === 'scene').length >= 2);
  for (const event of journal.events) {
    if (event.type !== 'scene') continue;
    const preset = await readFile(join(root, event.preset, 'live.yaml'), 'utf8');
    assert(!preset.includes('Broken scene'), 'Journal included a scene that never reached output');
  }
  const replay = replayEvents(journal.header, journal.events, 0, 60);
  assert(replay.automation.some((event) => event.to.brightness === 0));
  assert(replay.automation.some((event) => event.to.intensity === 2));
  assert.equal(
    (await (await fetch(server.url + '/scenes.json')).json()).length,
    2,
    'Journal snapshots polluted the scene bank',
  );
  assert.equal(errors.length, 0, errors.join('\n'));
  await writeFile(
    join(out, 'result.json'),
    JSON.stringify(
      { events: journal.events.length, performance: replay.automation, errors },
      null,
      2,
    ),
  );
  process.stdout.write(
    'Performance: PASS (scene saves/recall, dimmer, blackout, MIDI, operator transfer, journal replay)\n',
  );
} catch (error) {
  await page.screenshot({ path: join(out, 'failure.png') });
  await writeFile(
    join(out, 'failure.txt'),
    String(error) + '\n' + (await page.locator('body').innerText()),
  );
  throw error;
} finally {
  await browser.close();
  await server.close();
  await rm(root, { recursive: true, force: true });
}
