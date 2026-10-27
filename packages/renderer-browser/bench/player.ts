import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadLiveProject } from '@setcast/core/node';
import { readSession } from '@setcast/core';
import { themes } from '../../themes/src/index.ts';
import { play } from '../src/index.ts';
import { launchLiveBrowser, pageErrors, writeFixture } from './live-harness.ts';

const { values } = parseArgs({
  options: {
    seconds: { type: 'string', default: '30' },
    out: { type: 'string', default: 'examples/demo/out/player-check' },
  },
});
const seconds = Number(values.seconds);
assert(
  Number.isFinite(seconds) && seconds >= 10 && seconds <= 7200,
  '--seconds must be 10 to 7200',
);
const out = resolve(values.out);
await mkdir(out, { recursive: true });
const root = await writeFixture('player-check', {
  'live.yaml':
    'theme: darkroom\ntitle: Input qualification\noutput: {width: 960, height: 540, fps: 30}\n',
});
const { project } = await loadLiveProject(root, { themes });
const server = await play(project, {
  projectDir: root,
  port: 0,
  themes: {
    choices: Object.values(themes),
    load: async (theme) => (await loadLiveProject(root, { themes, theme })).project,
  },
});
const browser = await launchLiveBrowser({ autoplay: true, args: ['--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = pageErrors(page);
try {
  await page.goto(server.url);
  assert(await page.getByRole('button', { name: 'Tap tempo', exact: true }).isDisabled());
  await page.getByRole('button', { name: 'Start input', exact: true }).click();
  await page.locator('[data-capture="running"]').waitFor();
  await checkTempo();
  await page.getByText('Session journal', { exact: true }).click();
  await page.getByRole('button', { name: 'Start journal', exact: true }).click();
  await page.getByRole('button', { name: 'Finish journal', exact: true }).waitFor();
  await page.getByLabel('Artist', { exact: true }).fill('Fixture artist');
  await page.getByLabel('Track title', { exact: true }).fill('Fixture recording');
  await page.getByRole('button', { name: 'Log track now', exact: true }).click();
  await page.getByRole('button', { name: 'drop', exact: true }).click();
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Operator window', exact: true }).click();
  const operator = await popupPromise;
  await operator.getByRole('button', { name: 'Stop input', exact: true }).waitFor();
  await operator.locator('.sc-live-journal summary').click();
  assert(
    await operator.getByRole('button', { name: 'Finish journal', exact: true }).count(),
    'Journal survived moving controls',
  );
  const samples: { elapsed: number; frame: number; capture: string | null }[] = [];
  const started = Date.now();
  let changed = 0;
  while (Date.now() - started < seconds * 1000) {
    if (changed < Object.keys(themes).length) {
      await operator
        .getByLabel('Theme', { exact: true })
        .selectOption(Object.keys(themes)[changed++]!);
    }
    const state = await page.locator('main').evaluate((element) => ({
      frame: Number(element.getAttribute('data-frame')),
      capture: element.getAttribute('data-capture'),
      dropped: Number(element.getAttribute('data-dropped')),
      cached: Number(element.getAttribute('data-cached')),
      pcmCapacity: Number(element.getAttribute('data-pcm-capacity')),
      heapBytes:
        (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
          ?.usedJSHeapSize ?? null,
    }));
    samples.push({ elapsed: (Date.now() - started) / 1000, ...state });
    assert.equal(state.capture, 'running');
    assert(state.cached <= 2048, 'Feature cache exceeded its bound');
    assert(state.dropped === 0, 'Capture dropped analysis samples');
    if (samples.length % 60 === 0) {
      await writeFile(
        join(out, 'checkpoint.json'),
        JSON.stringify({ synthetic: true, seconds, samples }, null, 2),
      );
      process.stdout.write(
        `Player check: ${Math.round((Date.now() - started) / 1000)} seconds, frame ${state.frame}\n`,
      );
    }
    await page.waitForTimeout(1000);
  }
  await page.screenshot({ path: join(out, 'output.png') });
  await operator.screenshot({ path: join(out, 'operator.png') });
  await operator.getByRole('button', { name: 'Finish journal', exact: true }).click();
  await operator.waitForTimeout(1500);
  const path = await operator
    .locator('.sc-live-journal p')
    .filter({ hasText: 'Saved to ' })
    .innerText();
  const journal = readSession(await readFile(join(root, path.replace('Saved to ', '')), 'utf8'));
  assert(journal.events.some((event) => event.type === 'credit'));
  assert(journal.events.some((event) => event.type === 'cue'));
  assert(journal.events.some((event) => event.type === 'scene'));
  assert.equal(journal.events.at(-1)?.type, 'end');
  const closed = operator.waitForEvent('close');
  await operator.getByRole('button', { name: 'Return controls to output', exact: true }).click();
  await closed;
  await page.getByRole('button', { name: 'Stop input', exact: true }).waitFor();
  await checkRestart();
  assert.equal(errors.length, 0, errors.join('\n'));
  await writeFile(
    join(out, 'result.json'),
    JSON.stringify(
      {
        synthetic: true,
        seconds,
        browser: browser.version(),
        samples,
        events: journal.events.length,
        errors,
      },
      null,
      2,
    ),
  );
  process.stdout.write(
    `Synthetic player check passed: ${seconds}s, ${journal.events.length} journal events. ${out}\n`,
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

async function checkRestart() {
  await page.locator('.sc-live-journal summary').click();
  await page.getByRole('button', { name: 'Start journal', exact: true }).click();
  await page.getByRole('button', { name: 'Finish journal', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Stop input', exact: true }).click();
  await page.locator('[data-capture="stopped"]').waitFor();
  await page.waitForTimeout(500);
  const path = await page
    .locator('.sc-live-journal p')
    .filter({ hasText: 'Saved to ' })
    .innerText();
  const journal = readSession(await readFile(join(root, path.replace('Saved to ', '')), 'utf8'));
  assert.equal(journal.events.at(-1)?.type, 'end', 'Stopping input did not end its journal');
  await page.getByRole('button', { name: 'Start input', exact: true }).click();
  await page.locator('[data-capture="running"]').waitFor();
  assert(
    Number(await page.locator('main').getAttribute('data-frame')) < 60,
    'Restart did not reset capture time',
  );
}

async function checkTempo() {
  await page.getByLabel('Tempo (BPM)', { exact: true }).fill('174');
  await page.getByRole('button', { name: 'Tap tempo', exact: true }).click();
  await page.waitForTimeout(350);
  await page.getByRole('button', { name: 'Tap tempo', exact: true }).click();
  const bpm = Number(await page.getByLabel('Tempo (BPM)', { exact: true }).inputValue());
  assert(bpm > 140 && bpm < 200, `Tap tempo produced ${bpm} BPM`);
  await page.getByRole('button', { name: 'Downbeat now', exact: true }).click();
}
