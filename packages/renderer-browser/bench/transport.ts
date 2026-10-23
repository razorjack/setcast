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
  assert.equal(current.dropped, 0, 'Current transport dropped samples during a 300 ms stall');
  assert(legacy.dropped > 0, 'Negative control did not exercise the former queue limit');
  await writeFile(
    join(out, 'report.json'),
    JSON.stringify({ stallMilliseconds: 300, current, legacy }, null, 2) + '\n',
  );
  process.stdout.write(
    `Transport: PASS (current ${current.dropped}, former 8-packet queue ${legacy.dropped} dropped samples). ${out}\n`,
  );
} finally {
  await browser.close();
  await server.close();
}

async function stalledCapture(legacy: boolean) {
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
        await page.evaluate(() => window.legacyTransportUsed),
        'Negative control did not install its worklet module',
      );
    const first = Number(await page.locator('main').getAttribute('data-frame'));
    await page.evaluate(() =>
      setTimeout(() => {
        const end = performance.now() + 300;
        while (performance.now() < end) {
          /* Exercise a main-thread task outside debugger evaluation. */
        }
      }, 0),
    );
    await page.waitForFunction(
      (frame) => Number(document.querySelector('main')?.getAttribute('data-frame')) > frame + 30,
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
    legacyTransportUsed: boolean;
  }
}

async function installLegacyBudget(page: Page) {
  const current = await readFile(new URL('../entry/capture-worklet.js', import.meta.url), 'utf8');
  const source = current.replace(/const MAX_PENDING = [^;]+;/, 'const MAX_PENDING = 8;');
  assert.notEqual(source, current);
  await page.addInitScript((source) => {
    window.AudioContext = new Proxy(AudioContext, {
      construct(target, args) {
        const context = Reflect.construct(target, args) as AudioContext;
        const add = context.audioWorklet.addModule.bind(context.audioWorklet);
        context.audioWorklet.addModule = (url, options) => {
          if (!String(url).endsWith('/capture-worklet.js')) return add(url, options);
          window.legacyTransportUsed = true;
          const fixture = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
          return add(fixture, options).finally(() => URL.revokeObjectURL(fixture));
        };
        return context;
      },
    });
  }, source);
}
