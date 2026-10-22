// Chromium check of live branding: logo readiness, operator edits, visibility toggles, MIDI,
// announcements, blackout, projection, scene save/recall, journal and replay, and portrait.
// Run: node packages/renderer-browser/bench/branding.ts   (screenshots in examples/demo/out/branding-check)
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import { loadLiveProject } from '@setcast/core/node';
import { readSession, replayEvents } from '@setcast/core';
import { themes } from '../../themes/src/index.ts';
import { play } from '../src/index.ts';

declare global {
  interface Window {
    emitMidi: (bytes: number[]) => void;
  }
}

const out = resolve('examples/demo/out/branding-check');
const logo = resolve('examples/demo/assets/logo.svg');
await mkdir(out, { recursive: true });

const LIVE_YAML = `theme: sterile-tech
title: ''
output: {width: 960, height: 540, fps: 30}
visualizer: {name: radial}
branding:
  logo: logo.svg
  name: Null Vector
  event: Neurofunk Sessions
  episode: Episode 42
  messages: {lines: [instagram.com/nullvector], seconds: 3, gap: 0}
`;

async function runLandscape() {
  const root = await project(LIVE_YAML);
  const { project: initial } = await loadLiveProject(root, { themes });
  const server = await play(initial, {
    projectDir: root,
    port: 0,
    themes: {
      choices: Object.values(themes),
      load: async (theme) => (await loadLiveProject(root, { themes, theme })).project,
    },
  });
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(fakeMidi);
  try {
    await page.goto(server.url);
    await startWithLogo(page);
    await editBranding(page);
    await announce(page);
    await toggleWithMidi(page);
    await recallSavedBranding(page);
    await coverAndProject(page);
    const announcements = await checkJournal(page, root);
    assert.equal(errors.length, 0, errors.join('\n'));
    return announcements;
  } catch (error) {
    await page.screenshot({ path: join(out, 'failure.png') });
    throw error;
  } finally {
    await browser.close();
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
}

async function startWithLogo(page: Page) {
  await page.getByRole('button', { name: 'Start input', exact: true }).click();
  await page.locator('[data-capture="running"]').waitFor();
  const logo = onStage(page, '.sc-brand-logo');
  await logo.waitFor();
  assert(
    await logo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
  );
  assert.equal(await shown(page, '.sc-brand-name'), 'Null Vector');
  await onStage(page, '.sc-brand-message').waitFor();
  await outputShot(page, 'live-output');
}

async function editBranding(page: Page) {
  await page.locator('.sc-live-branding summary').click();
  await page.getByLabel('Show identity', { exact: true }).uncheck();
  await onStage(page, '.sc-brand-identity').waitFor({ state: 'detached' });
  await page.getByLabel('Show identity', { exact: true }).check();
  await page.getByLabel('Branding name', { exact: true }).fill('Guest DJ');
  await page.getByRole('button', { name: 'Apply identity', exact: true }).click();
  await onStage(page, '.sc-brand-name', 'Guest DJ').waitFor();
  await page.getByLabel('Branding position', { exact: true }).selectOption('center');
  await page.getByLabel('Branding size', { exact: true }).selectOption('2');
  await onStage(page, '.sc-brand-identity[data-position="center"]').waitFor();
  await page.getByRole('button', { name: 'Save scene', exact: true }).click();
  await page.locator('.sc-scene-pads button').first().waitFor();
}

async function announce(page: Page) {
  await page.getByText('Session journal', { exact: true }).click();
  await page.getByRole('button', { name: 'Start journal', exact: true }).click();
  await page.getByRole('button', { name: 'Finish journal', exact: true }).waitFor();

  await page.getByLabel('Announcement text', { exact: true }).fill('Last track');
  await page.getByRole('button', { name: 'Announce', exact: true }).click();
  await onStage(page, '.sc-brand-message[data-kind="announcement"]').waitFor();
  await page.waitForTimeout(800);
  await outputShot(page, 'live-announcement');
  await page.getByRole('button', { name: 'Clear announcement', exact: true }).click();
  await onStage(page, '.sc-brand-message[data-kind="announcement"]').waitFor({
    state: 'detached',
  });
}

async function toggleWithMidi(page: Page) {
  await page.getByText('MIDI controls', { exact: true }).click();
  await page.getByRole('button', { name: 'Connect MIDI', exact: true }).click();
  await page.getByLabel('MIDI input', { exact: true }).selectOption('fixture');
  await page.evaluate(() => window.emitMidi([0x90, 45, 127]));
  await onStage(page, '.sc-brand-identity').waitFor({ state: 'detached' });
  await page.evaluate(() => window.emitMidi([0x90, 46, 127]));
  await page.waitForFunction(
    () => !document.querySelector<HTMLInputElement>('[aria-label="Show messages"]')?.checked,
  );
  await page.evaluate(() => window.emitMidi([0x90, 45, 127]));
  await onStage(page, '.sc-brand-identity').waitFor();
}

async function recallSavedBranding(page: Page) {
  await page.getByLabel('Branding name', { exact: true }).fill('Changed');
  await page.getByRole('button', { name: 'Apply identity', exact: true }).click();
  await onStage(page, '.sc-brand-name', 'Changed').waitFor();
  await page.locator('.sc-scene-pads button').first().click();
  await onStage(
    page,
    '.sc-brand-identity[data-position="center"] .sc-brand-name',
    'Guest DJ',
  ).waitFor();
  assert.equal(
    await page.getByLabel('Branding name', { exact: true }).inputValue(),
    'Guest DJ',
    'Recall did not reset the identity fields',
  );
}

async function coverAndProject(page: Page) {
  await page.getByRole('button', { name: 'Blackout', exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLElement>('.sc-live-scene[data-ready="true"] .sc-output-dimmer')
        ?.style.opacity === '1',
  );
  await outputShot(page, 'live-blackout');
  await assertBlack(page);
  await page.getByRole('button', { name: 'Restore output', exact: true }).click();

  await page.locator('.sc-projection-settings summary').click();
  await page.getByLabel('Enable projection correction').check();
  const frame = page.frameLocator('iframe[title="Projected scene"]');
  await frame
    .locator('.sc-live-scene[data-ready="true"] .sc-brand-logo')
    .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)
    .then((loaded) => assert(loaded, 'Logo did not load in the projected scene'));
  await outputShot(page, 'live-projection');
  await page.getByLabel('Enable projection correction').uncheck();
}

async function checkJournal(page: Page, root: string) {
  await page.getByRole('button', { name: 'Finish journal', exact: true }).click();
  await page.waitForTimeout(1000);
  const file = (
    await page.locator('.sc-live-journal p').filter({ hasText: 'Saved to ' }).innerText()
  ).replace('Saved to ', '');
  const journal = readSession(await readFile(join(root, file), 'utf8'));
  const types = journal.events.map((event) => event.type);
  assert(types.includes('announcement'), 'Journal is missing the announcement');
  assert(types.includes('announcement_end'), 'Journal is missing the early end');
  const replay = replayEvents(journal.header, journal.events, 0, 600);
  assert.equal(replay.announcements.length, 1);
  assert(replay.announcements[0]!.seconds < 10, 'Clear did not shorten the announcement');
  const scenes = journal.events.filter((event) => event.type === 'scene');
  const snapshot = await loadLiveProject(join(root, scenes.at(-1)!.preset), { themes });
  assert.equal(snapshot.project.branding?.name, 'Guest DJ');
  assert.match(snapshot.project.branding?.logo ?? '', /^assets\/\d+\.svg$/);
  await page.locator('.sc-live-branding').screenshot({ path: join(out, 'operator.png') });
  return replay.announcements.length;
}

async function runPortrait() {
  const yaml = LIVE_YAML.replace(
    '{width: 960, height: 540, fps: 30}',
    '{width: 540, height: 960, fps: 30}',
  );
  const root = await project(`${yaml}\nclock: true\n`);
  const { project: initial } = await loadLiveProject(root, { themes });
  const server = await play(initial, { projectDir: root, port: 0 });
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 700, height: 1100 } });
  try {
    await page.goto(server.url);
    await page.getByRole('button', { name: 'Start input', exact: true }).click();
    await page.locator('[data-capture="running"]').waitFor();
    await onStage(page, '.sc-brand-message').waitFor();
    await page.keyboard.press('h');
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(out, 'live-portrait.png') });
  } finally {
    await browser.close();
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
}

/** The output as the audience sees it, without the operator controls over it. */
async function outputShot(page: Page, name: string) {
  await toggleControls(page, 'hidden');
  await page.screenshot({ path: join(out, `${name}.png`) });
  await toggleControls(page, 'visible');
}

async function toggleControls(page: Page, state: 'hidden' | 'visible') {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('h');
  await page.locator('.sc-live-controls').waitFor({ state });
}

async function project(yaml: string) {
  const root = await mkdtemp(join(tmpdir(), 'setcast-branding-'));
  await copyFile(logo, join(root, 'logo.svg'));
  await writeFile(join(root, 'live.yaml'), yaml);
  return root;
}

function launch() {
  return chromium.launch({
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
}

/** An element of the scene on screen, optionally with exactly this text. */
function onStage(page: Page, selector: string, text?: string) {
  const locator = page.locator(`.sc-live-scene[data-ready="true"] .sc-stage ${selector}`);
  return text === undefined ? locator : locator.filter({ hasText: new RegExp(`^${text}$`) });
}

const shown = (page: Page, selector: string) =>
  page.locator(`.sc-live-scene[data-ready="true"] ${selector}`).innerText();

/** Blackout covers branding too: the identity's area captures as black. */
async function assertBlack(page: Page) {
  await toggleControls(page, 'hidden');
  const file = join(out, 'blackout-identity.png');
  await page
    .locator('.sc-live-scene[data-ready="true"] .sc-brand-identity')
    .screenshot({ path: file });
  const decoded = spawnSync('ffmpeg', [
    '-v',
    'error',
    '-i',
    file,
    '-f',
    'rawvideo',
    '-pix_fmt',
    'gray',
    '-',
  ]);
  assert.equal(decoded.status, 0, 'ffmpeg could not decode the blackout capture');
  assert(Math.max(...decoded.stdout) < 8, 'Branding showed through blackout');
  await toggleControls(page, 'visible');
}

function fakeMidi() {
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
}

const landscape = await runLandscape();
await runPortrait();
process.stdout.write(
  `Branding: PASS (logo, edits, toggles, MIDI, announcements, blackout, projection, scenes, journal replay with ${landscape} announcement(s), portrait)\n`,
);
