import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import { MidiProfileSchema, readSession, type MidiProfile } from '@setcast/core';
import { loadLiveProject } from '@setcast/core/node';
import { themes } from '../../themes/src/index.ts';
import { play } from '../src/index.ts';

declare global {
  interface Window {
    emitMidi: (bytes: number[]) => void;
    midiRequests: number;
  }
}
const root = await mkdtemp(join(tmpdir(), 'setcast-midi-'));
const out = resolve('examples/demo/out/midi-check');
await mkdir(out, { recursive: true });
const browserProfile = { version: 1, name: 'Stored browser', mapping: { 'note:1:1': 'blackout' } };
const configured = {
  name: 'Configured booth',
  mapping: { 'cc:2:7': 'brightness', 'note:2:60': 'blackout' },
};
const imported: MidiProfile = {
  version: 1,
  name: 'Guest controller',
  mapping: {
    'cc:3:9': 'brightness',
    'note:3:60': 'blackout',
    'note:3:61': 'branding',
    'note:3:62': 'scene-1',
  },
};
await writeFile(
  join(root, 'live.yaml'),
  JSON.stringify({
    title: 'Controller fixture',
    bpm: 120,
    output: { width: 960, height: 540, fps: 30 },
    visualizer: { name: 'field' },
    branding: { name: 'Controller fixture' },
    midi: configured,
  }),
);
const loaded = await loadLiveProject(root, { themes });
const server = await play(loaded.project, { projectDir: root, port: 0 });
const browser = await chromium.launch({
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
try {
  await configuredSession();
  await browserPersistence();
  process.stdout.write(`MIDI: PASS (artifacts: ${out})\n`);
} finally {
  await browser.close();
  await server.close();
  await rm(root, { recursive: true, force: true });
}

async function configuredSession() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(fakeMidi);
  await page.addInitScript(
    (profile) => localStorage.setItem('setcast-midi-profile-v1', JSON.stringify(profile)),
    browserProfile,
  );
  await page.goto(server.url);
  await page.getByText('MIDI controls', { exact: true }).click();
  assert.match(
    await page.locator('.sc-midi-profile-source').innerText(),
    /live.yaml.*Configured booth.*2 mappings/,
  );
  await transferChecks(page);
  await page.getByRole('button', { name: 'Start input', exact: true }).click();
  await page.locator('main[data-capture=running]').waitFor();
  await page.getByRole('button', { name: 'Save scene', exact: true }).click();
  await page.locator('.sc-scene-pads button').waitFor();
  await page.getByLabel('Start on next bar').uncheck();
  await page.getByLabel('Scene transition', { exact: true }).selectOption('0');
  await page.locator('.sc-live-journal summary').click();
  await page.getByRole('button', { name: 'Start journal', exact: true }).click();
  await page.getByRole('button', { name: 'Connect MIDI', exact: true }).click();
  await page.getByLabel('MIDI input', { exact: true }).selectOption('fixture');
  await controlsAndLearning(page);
  await operatorChecks(page);
  assert.equal(await page.locator('main').getAttribute('data-dropped'), '0');
  assert.equal(await page.evaluate(() => window.midiRequests), 1);
  assert.deepEqual(
    await page.evaluate(() => JSON.parse(localStorage.getItem('setcast-midi-profile-v1')!)),
    browserProfile,
  );
  assert.deepEqual(errors, []);
  await checkFiles();
  await page.close();
}

async function transferChecks(page: Page) {
  assert.deepEqual((await exportProfile(page)).mapping, configured.mapping);
  await upload(page, { ...imported, version: 2 });
  await page.getByRole('alert').filter({ hasText: 'Cannot import MIDI profile' }).waitFor();
  assert.deepEqual((await exportProfile(page)).mapping, configured.mapping);
  await upload(page, imported);
  await page.getByRole('alert').filter({ hasText: 'Imported MIDI profile' }).waitFor();
  assert.deepEqual(await exportProfile(page), imported);
  assert.equal(
    await page.evaluate(() => window.midiRequests),
    0,
    'Import requested hardware permission',
  );
}

async function controlsAndLearning(page: Page) {
  await page.evaluate(() => window.emitMidi([0xb1, 7, 0]));
  await page.waitForTimeout(150);
  assert.equal(await page.getByLabel('Brightness', { exact: true }).inputValue(), '1');
  await page.evaluate(() => window.emitMidi([0xb2, 9, 64]));
  await page.waitForFunction(
    () =>
      Number(document.querySelector<HTMLInputElement>('input[aria-label=Brightness]')?.value) <
      0.51,
  );
  await page.evaluate(() => window.emitMidi([0x92, 60, 127]));
  await page.getByRole('button', { name: 'Restore output', exact: true }).waitFor();
  await page.evaluate(() => window.emitMidi([0x92, 60, 127]));
  await page.getByRole('button', { name: 'Blackout', exact: true }).waitFor();
  await page.getByLabel('MIDI action').selectOption('brightness');
  await page.getByRole('button', { name: 'Learn MIDI', exact: true }).click();
  await page.evaluate(() => window.emitMidi([0xb3, 10, 64]));
  const learned = await exportProfile(page);
  assert.equal(learned.mapping['cc:3:9'], undefined);
  assert.equal(learned.mapping['cc:4:10'], 'brightness');
  const before = Number(await page.locator('main').getAttribute('data-frame'));
  await page.getByLabel('Title', { exact: true }).fill('Changed title');
  await page.evaluate(() => window.emitMidi([0x92, 62, 127]));
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLInputElement>('input[aria-label=Title]')?.value ===
      'Controller fixture',
  );
  assert(Number(await page.locator('main').getAttribute('data-frame')) >= before);
  assert.equal((await exportProfile(page)).mapping['cc:4:10'], 'brightness');
}

async function operatorChecks(page: Page) {
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Operator window', exact: true }).click();
  const operator = await popup;
  await operator.locator('.sc-performance-midi').waitFor();
  await operator.getByText('MIDI controls', { exact: true }).click();
  await operator.getByText(/Mapping list/).click();
  await operator.screenshot({ path: join(out, 'operator.png') });
  await upload(operator, { version: 1, name: 'No actions', mapping: {} });
  await operator.getByText('No mapped actions.', { exact: false }).waitFor();
  const before = await operator.getByLabel('Brightness', { exact: true }).inputValue();
  await page.evaluate(() => window.emitMidi([0xb3, 10, 127]));
  await page.waitForTimeout(150);
  assert.equal(await operator.getByLabel('Brightness', { exact: true }).inputValue(), before);
  await operator.getByRole('button', { name: 'Reset MIDI mappings', exact: true }).click();
  await page.evaluate(() => window.emitMidi([0x90, 45, 127]));
  await page.locator('.sc-brand-identity').waitFor({ state: 'detached' });
  await operator.locator('.sc-live-journal summary').click();
  await operator.getByRole('button', { name: 'Finish journal', exact: true }).click();
  await operator.getByText(/^Saved to /).waitFor();
  await operator.screenshot({ path: join(out, 'defaults.png') });
  await operator.close();
}

async function checkFiles() {
  const entries = await readdir(root);
  const scene = entries.find((entry) => entry.startsWith('saved-scene-'))!;
  assert.equal((await loadLiveProject(join(root, scene))).project.live.midi, undefined);
  const journal = readSession(
    await readFile(
      join(
        root,
        entries.find((entry) => entry.endsWith('.jsonl'))!,
      ),
      'utf8',
    ),
  );
  assert(journal.events.some((event) => event.type === 'scene'));
  assert(journal.events.some((event) => event.type === 'performance'));
  assert.equal(journal.events.at(-1)?.type, 'end');
}

async function browserPersistence() {
  const project = { ...loaded.project, live: { ...loaded.project.live, midi: undefined } };
  const plain = await play(project, { projectDir: root, port: 0 });
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(plain.url);
    await page.evaluate(() =>
      localStorage.setItem('setcast-midi-v1', JSON.stringify({ 'cc:5:7': 'brightness' })),
    );
    await page.evaluate(() => localStorage.removeItem('setcast-midi-profile-v1'));
    await page.reload();
    await page.getByText('MIDI controls', { exact: true }).click();
    assert.equal((await exportProfile(page)).mapping['cc:5:7'], 'brightness');
    await upload(page, imported);
    await page.locator('.sc-midi-profile-source').filter({ hasText: 'Guest controller' }).waitFor();
    await page.reload();
    await page.getByText('MIDI controls', { exact: true }).click();
    assert.deepEqual(await exportProfile(page), imported);
  } finally {
    await context.close();
    await plain.close();
  }
}

async function exportProfile(page: Page) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export MIDI profile', exact: true }).click();
  const file = join(out, 'profile.json');
  await (await download).saveAs(file);
  return MidiProfileSchema.parse(JSON.parse(await readFile(file, 'utf8')));
}
async function upload(page: Page, profile: unknown) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import MIDI profile', exact: true }).focus();
  await page.keyboard.press('Enter');
  await (
    await chooser
  ).setFiles({
    name: 'profile.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(profile)),
  });
}
function fakeMidi() {
  window.midiRequests = 0;
  const input = Object.assign(new EventTarget(), {
    id: 'fixture',
    name: 'Fixture controller',
    state: 'connected',
    close: async () => {},
  });
  const access = Object.assign(new EventTarget(), { inputs: new Map([['fixture', input]]) });
  Object.defineProperty(navigator, 'requestMIDIAccess', {
    value: async () => {
      window.midiRequests++;
      return access;
    },
  });
  window.emitMidi = (bytes) => {
    const event = new Event('midimessage');
    Object.defineProperty(event, 'data', { value: new Uint8Array(bytes) });
    input.dispatchEvent(event);
  };
}
