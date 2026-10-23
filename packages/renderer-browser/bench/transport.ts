import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium, type Page } from 'playwright';
import { loadLiveProject } from '@setcast/core/node';
import { themes } from '../../themes/src/index.ts';
import { play } from '../src/index.ts';

const out = resolve('examples/demo/out/transport-check');
await mkdir(out, { recursive: true });
const projectDir = resolve('examples/live');
const { project } = await loadLiveProject(projectDir, { themes });
const server = await play({ ...project, visualizers: [] }, { projectDir, port: 0 });
const browser = await chromium.launch({
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
try {
  const current = await stalledCapture(false);
  const legacy = await stalledCapture(true);
  const longStall = await stalledCapture(false, 2000);
  const starvation = await starvedCapture();
  assert.equal(current.dropped, 0, 'Current transport dropped samples during a 300 ms stall');
  assert(legacy.dropped > 0, 'Negative control did not exercise the former queue limit');
  assert(longStall.dropped > 0, 'Long-stall fixture did not exceed the transport budget');
  await writeFile(
    join(out, 'report.json'),
    JSON.stringify(
      {
        stallMilliseconds: 300,
        current,
        legacy,
        longStall: { milliseconds: 2000, ...longStall },
        starvation,
      },
      null,
      2,
    ) + '\n',
  );
  process.stdout.write(
    `Transport: PASS (current ${current.dropped}, former 8-packet queue ${legacy.dropped} dropped samples; 2 s stall survives with ${longStall.dropped} skipped samples; starvation fails). ${out}\n`,
  );
} finally {
  await browser.close();
  await server.close();
}

async function stalledCapture(legacy: boolean, milliseconds = 300) {
  const page = await browser.newPage();
  try {
    if (legacy) await installLegacyBudget(page);
    await page.goto(server.url);
    await page.getByRole('button', { name: 'Start input', exact: true }).click();
    await page.waitForFunction(
      () => Number(document.querySelector('main')?.getAttribute('data-frame')) > 30,
    );
    assert.equal(await page.locator('main').getAttribute('data-dropped'), '0');
    if (legacy)
      assert(
        await page.evaluate(() => window.transportFixtureUsed),
        'Negative control did not install its worklet module',
      );
    const first = Number(await page.locator('main').getAttribute('data-frame'));
    await page.evaluate(
      (milliseconds) =>
        setTimeout(() => {
          const end = performance.now() + milliseconds;
          while (performance.now() < end) {
            /* Exercise a main-thread task outside debugger evaluation. */
          }
        }, 0),
      milliseconds,
    );
    await page.waitForFunction(
      (frame) =>
        document.querySelector('main')?.getAttribute('data-capture') === 'error' ||
        Number(document.querySelector('main')?.getAttribute('data-frame')) > frame + 30,
      first,
    );
    assert.equal(await page.locator('main').getAttribute('data-capture'), 'running');
    return {
      dropped: Number(await page.locator('main').getAttribute('data-dropped')),
      first,
      last: Number(await page.locator('main').getAttribute('data-frame')),
    };
  } finally {
    await page.close();
  }
}

declare global {
  interface Window {
    transportFixtureUsed: boolean;
  }
}

async function installLegacyBudget(page: Page) {
  const current = await readFile(new URL('../entry/capture-worklet.js', import.meta.url), 'utf8');
  const source = current.replace(/const MAX_PENDING = [^;]+;/, 'const MAX_PENDING = 8;');
  assert.notEqual(source, current);
  await installWorklet(page, source);
}

async function installWorklet(page: Page, source: string) {
  await page.addInitScript((source) => {
    window.AudioContext = new Proxy(AudioContext, {
      construct(target, args) {
        const context = Reflect.construct(target, args) as AudioContext;
        const add = context.audioWorklet.addModule.bind(context.audioWorklet);
        context.audioWorklet.addModule = (url, options) => {
          if (!String(url).endsWith('/capture-worklet.js')) return add(url, options);
          window.transportFixtureUsed = true;
          const fixture = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
          return add(fixture, options).finally(() => URL.revokeObjectURL(fixture));
        };
        return context;
      },
    });
  }, source);
}

async function starvedCapture() {
  const page = await browser.newPage();
  try {
    const current = await readFile(new URL('../entry/capture-worklet.js', import.meta.url), 'utf8');
    const source = current.replace(
      'process(inputs) {',
      'process(inputs) { if (this.origin !== null && currentFrame - this.origin > sampleRate * 2) return true;',
    );
    assert.notEqual(source, current);
    await installWorklet(page, source);
    await page.goto(server.url);
    await page.getByRole('button', { name: 'Start input', exact: true }).click();
    await page.locator('main[data-capture=running]').waitFor();
    assert(await page.evaluate(() => window.transportFixtureUsed));
    await page.locator('main[data-capture=error]').waitFor({ timeout: 10000 });
    assert.equal(await page.locator('main').getAttribute('data-pcm-capacity'), '0');
    const notices = await page.getByRole('alert').allTextContents();
    assert(notices.some((notice) => notice.includes('Audio packets stopped arriving')));
    return { stoppedAfterSeconds: 2, released: true, notices };
  } finally {
    await page.close();
  }
}
