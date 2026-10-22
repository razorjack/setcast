import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium, type Page } from 'playwright';
import { loadLiveProject } from '@setcast/core/node';
import { themes } from '../../themes/src/index.ts';
import { play } from '../src/index.ts';

const artifacts = resolve('examples/demo/out/output-check');
await mkdir(artifacts, { recursive: true });
const projectDir = resolve('examples/live-field');
const { project } = await loadLiveProject(projectDir, { themes });
const server = await play(project, { projectDir, port: 0 });
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(
    `(${installProbes.toString()})(); (${throttleFrames.toString()})(window.outputProbe);`,
  );
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(server.url);
  await page.locator('.sc-input-fallback').waitFor();
  await page.getByRole('button', { name: 'Start input', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('main')?.getAttribute('data-input-available') === 'true',
  );
  await page.locator('.sc-input-fallback').waitFor({ state: 'detached' });
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Operator window', exact: true }).click();
  const operator = await popup;
  await operator.locator('.sc-output-settings summary').click();
  await checkInputLoss(page, operator);
  await checkDisplays(page, operator);
  await checkQuality(page, operator);
  await operator.screenshot({ path: join(artifacts, 'operator.png'), fullPage: true });
  await page.screenshot({ path: join(artifacts, 'output.png') });
  await operator.close();
  await page.waitForTimeout(700);
  assert.equal(await page.locator('main').getAttribute('data-clean'), 'true');
  assert(
    await page.locator('.sc-live-controls').isHidden(),
    'Unexpected popup closure exposed controls',
  );
  await page.keyboard.press('h');
  await page.getByRole('button', { name: 'Stop input', exact: true }).waitFor();
  assert.deepEqual(errors, [], 'Output raised browser errors');
  process.stdout.write(`output: PASS (artifacts: ${artifacts})\n`);
} finally {
  await browser.close();
  await server.close();
}

declare global {
  interface Window {
    outputProbe: {
      track: MediaStreamTrack | null;
      node: AudioWorkletNode | null;
      displays: EventTarget & {
        screens: { label: string; left: number; top: number; width: number; height: number }[];
      };
      selected: string | null;
      deny: boolean;
      slow: boolean;
    };
  }
}

function installProbes() {
  const displays = Object.assign(new EventTarget(), {
    screens: [
      { label: 'Laptop', left: 0, top: 0, width: 1280, height: 900 },
      { label: 'Projector', left: 1280, top: 0, width: 1920, height: 1080 },
    ],
  });
  window.outputProbe = {
    track: null,
    node: null,
    displays,
    selected: null,
    deny: false,
    slow: false,
  };
  Object.defineProperty(window, 'getScreenDetails', {
    value: async () => {
      if (window.outputProbe.deny) throw new DOMException('Permission denied', 'NotAllowedError');
      return displays;
    },
  });
  const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    const stream = await getUserMedia(constraints);
    window.outputProbe.track = stream.getAudioTracks()[0]!;
    return stream;
  };
  window.AudioWorkletNode = new Proxy(AudioWorkletNode, {
    construct(target, args) {
      const node = Reflect.construct(target, args) as AudioWorkletNode;
      window.outputProbe.node = node;
      return node;
    },
  });
  const fullscreen = Object.getOwnPropertyDescriptor(Element.prototype, 'requestFullscreen')!
    .value as Element['requestFullscreen'];
  Element.prototype.requestFullscreen = function (
    this: Element,
    options?: FullscreenOptions & { screen?: { label: string } },
  ) {
    window.outputProbe.selected = options?.screen?.label ?? null;
    return fullscreen.call(this);
  };
}

function throttleFrames(probe: Window['outputProbe']) {
  const request = window.requestAnimationFrame.bind(window);
  const cancel = window.cancelAnimationFrame.bind(window);
  const pending = new Map<number, { timer?: number; frame?: number }>();
  let id = 0;
  window.requestAnimationFrame = (callback) => {
    const key = ++id;
    const entry: { timer?: number; frame?: number } = {};
    pending.set(key, entry);
    const run = () => {
      entry.frame = request((time) => {
        pending.delete(key);
        callback(time);
      });
    };
    if (probe.slow) entry.timer = window.setTimeout(run, 100);
    else run();
    return key;
  };
  window.cancelAnimationFrame = (key) => {
    const entry = pending.get(key);
    if (entry?.frame !== undefined) cancel(entry.frame);
    if (entry?.timer !== undefined) clearTimeout(entry.timer);
    pending.delete(key);
  };
}

async function checkInputLoss(page: Page, operator: Page) {
  await page.evaluate(() => window.outputProbe.track!.dispatchEvent(new Event('mute')));
  await page.locator('.sc-input-fallback').waitFor();
  await operator
    .getByText('The audio input is temporarily unavailable.', { exact: true })
    .waitFor();
  assert.equal(await page.getByRole('alert').count(), 0, 'Input error leaked to the output');
  await operator.getByLabel('On input loss').selectOption('ambient');
  await page.locator('.sc-input-fallback').waitFor({ state: 'detached' });
  await operator.getByLabel('On input loss').selectOption('black');
  await page.evaluate(() => window.outputProbe.track!.dispatchEvent(new Event('unmute')));
  await page.locator('.sc-input-fallback').waitFor({ state: 'detached' });
  await page.evaluate(() => {
    window.outputProbe.node!.port.onmessage = null;
  });
  await page.locator('[data-capture="error"]').waitFor();
  await page.locator('.sc-input-fallback').waitFor();
  await operator.getByRole('button', { name: 'Start input', exact: true }).click();
  await page.locator('[data-input-available="true"]').waitFor();
  await page.locator('.sc-input-fallback').waitFor({ state: 'detached' });
}

async function checkDisplays(page: Page, operator: Page) {
  await page.evaluate(() => {
    window.outputProbe.deny = true;
  });
  await operator.getByRole('button', { name: 'Find displays', exact: true }).click();
  await operator.getByText(/Cannot list displays:/).waitFor();
  await page.evaluate(() => {
    window.outputProbe.deny = false;
  });
  await operator.getByRole('button', { name: 'Find displays', exact: true }).click();
  await operator.getByLabel('Output display').selectOption({ label: 'Projector · 1920×1080' });
  await operator.getByRole('button', { name: 'Restore fullscreen', exact: true }).click();
  // Cross-window activation is browser-controlled; F is the supported recovery path.
  try {
    await page.waitForFunction(() => Boolean(document.fullscreenElement), undefined, {
      timeout: 1500,
    });
  } catch {
    await page.bringToFront();
    await page.keyboard.press('f');
  }
  await page.waitForFunction(() => Boolean(document.fullscreenElement));
  assert.equal(await page.evaluate(() => window.outputProbe.selected), 'Projector');
  await page.evaluate(() => document.exitFullscreen());
  await operator.getByText(/Output left fullscreen/).waitFor();
  assert.equal(await page.locator('main').getAttribute('data-clean'), 'true');
  await page.evaluate(() => {
    window.outputProbe.displays.screens.pop();
    window.outputProbe.displays.dispatchEvent(new Event('screenschange'));
  });
  await operator.getByText(/selected output display disconnected/).waitFor();
  assert.equal(await operator.getByLabel('Output display').inputValue(), '');
}

async function checkQuality(page: Page, operator: Page) {
  await operator.getByLabel('Adaptive GPU resolution').uncheck();
  await page.waitForFunction(
    () => document.querySelector('main')?.getAttribute('data-render-scale') === '1',
  );
  await operator.getByLabel('Adaptive GPU resolution').check();
  const frame = Number(await page.locator('main').getAttribute('data-frame'));
  await page.evaluate(() => {
    window.outputProbe.slow = true;
  });
  await page.waitForFunction(
    () => Number(document.querySelector('main')?.getAttribute('data-render-scale')) < 1,
  );
  await page.waitForFunction(
    (first) => Number(document.querySelector('main')?.getAttribute('data-frame')) > first + 60,
    frame,
  );
  await page.waitForFunction(() => {
    const scale = Number(document.querySelector('main')?.getAttribute('data-render-scale'));
    return (
      scale < 1 && document.querySelector<HTMLCanvasElement>('.sc-field')?.width === 960 * scale
    );
  });
  await operator.getByLabel('Adaptive GPU resolution').uncheck();
  await page.waitForFunction(
    () => document.querySelector('main')?.getAttribute('data-render-scale') === '1',
  );
  assert.equal(await page.locator('.sc-field').getAttribute('width'), '960');
  await page.evaluate(() => {
    window.outputProbe.slow = false;
  });
}
