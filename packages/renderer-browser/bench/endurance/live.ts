import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type Page } from 'playwright';
import { loadLiveProject } from '@setcast/core/node';
import { readSession } from '@setcast/core';
import { themes } from '../../../themes/src/index.ts';
import { play } from '../../src/index.ts';
import type { EnduranceConfig } from './config.ts';
import type { EnduranceReport } from './report.ts';
import { recoverGpu } from './gpu-recovery.ts';
import { liveGraphicsArgs, liveGraphicsIdentity } from './graphics.ts';
import { launchLiveBrowser } from '../live-harness.ts';

export async function runLive(
  config: EnduranceConfig,
  out: string,
  report: EnduranceReport,
  signal: AbortSignal,
) {
  const root = await prepareScenes(config, out);
  const { project } = await loadLiveProject(root, { themes });
  const server = await play(project, { projectDir: root, port: 0 });
  try {
    const browser = await launchLiveBrowser({
      autoplay: true,
      args: [...liveGraphicsArgs(config.graphics), '--enable-precise-memory-info'],
    });
    report.report.details.browser = browser.version();
    report.report.details.syntheticInput = true;
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      report.report.details.viewport = page.viewportSize();
      const errors: string[] = [];
      watchErrors(page, errors);
      await page.goto(server.url);
      try {
        await exercise(page, { config, report, signal, errors });
      } catch (error) {
        await recordFailure(page, out, report);
        throw error;
      }
      await page.screenshot({ path: join(out, 'output.png') });
      await validateJournals(root, report);
    } finally {
      await browser.close();
    }
  } finally {
    await server.close();
  }
}

function watchErrors(page: Page, errors: string[]) {
  page.on('pageerror', (error) => {
    if (errors.length < 10) errors.push(error.message);
  });
  page.on('popup', (popup) => watchErrors(popup, errors));
}

async function recordFailure(page: Page, out: string, report: EnduranceReport) {
  const notices = await Promise.all(
    page
      .context()
      .pages()
      .map((window) =>
        window
          .locator('[role=alert]')
          .allTextContents()
          .catch(() => []),
      ),
  );
  report.report.details.notices = notices.flat().slice(0, 10);
  try {
    await page.screenshot({ path: join(out, 'failure.png'), timeout: 5000 });
    report.report.details.failureScreenshot = 'failure.png';
  } catch (error) {
    report.report.details.failureScreenshotError = String(error);
  }
}

async function prepareScenes(config: EnduranceConfig, out: string) {
  const root = join(out, 'workload');
  await mkdir(root);
  for (let index = -1; index < config.scenes.length; index++) {
    const directory = index < 0 ? root : join(root, `saved-scene-${index}`);
    await mkdir(directory, { recursive: true });
    const scene = config.scenes[Math.max(0, index)]!;
    await writeFile(
      join(directory, 'logo.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="24" fill="#ddaa66"/></svg>',
    );
    await writeFile(
      join(directory, 'live.yaml'),
      JSON.stringify({ ...scene, title: `Endurance ${Math.max(0, index)}` }),
    );
    const { project } = await loadLiveProject(directory, { themes });
    await writeFile(join(directory, 'theme.css'), project.css);
    await writeFile(
      join(directory, 'live.yaml'),
      JSON.stringify({
        ...scene,
        title: `Endurance ${Math.max(0, index)}`,
        theme: './theme.css',
        visualizer: project.visualizers,
        modulation: project.modulation,
      }),
    );
    await loadLiveProject(directory);
  }
  return root;
}

async function exercise(
  page: Page,
  options: {
    config: EnduranceConfig;
    report: EnduranceReport;
    signal: AbortSignal;
    errors: string[];
  },
) {
  const { config, report, signal, errors } = options;
  const controls = await prepareRun(page, config, report);
  const started = performance.now();
  let nextChange = config.changeSeconds;
  let nextRestart = config.restartSeconds || Infinity;
  let nextRecovery = config.gpuRecovery?.everySeconds ?? Infinity;
  let nextSample = 0;
  let cycle = 0;
  while ((performance.now() - started) / 1000 < config.seconds) {
    signal.throwIfAborted();
    assert.deepEqual(errors, [], 'Live browser raised errors');
    const elapsed = (performance.now() - started) / 1000;
    if (elapsed >= nextRestart) {
      await sample(page, report, controls);
      await restart(controls, page);
      await report.event('action', { name: 'restart', elapsed });
      nextRestart = elapsed + config.restartSeconds;
    }
    if (elapsed >= nextChange) {
      await changeScene(controls, cycle++ % config.scenes.length);
      await report.event('action', { name: 'scene-and-announcement', elapsed });
      nextChange = elapsed + config.changeSeconds;
    }
    if (config.gpuRecovery && elapsed >= nextRecovery) {
      const recovery = await recoverGpu(page, config.gpuRecovery);
      await report.event('action', { name: 'gpu-recovery', elapsed, ...recovery });
      nextRecovery = elapsed + config.gpuRecovery.everySeconds;
    }
    if (elapsed >= nextSample) {
      await sample(page, report, controls);
      await report.checkpoint();
      nextSample = elapsed + config.sampleSeconds;
    }
    await page.waitForTimeout(250);
  }
  await finishJournal(controls);
  await sample(page, report, controls);
  assert.deepEqual(errors, []);
  report.report.details.workloadSeconds = (performance.now() - started) / 1000;
}

async function prepareRun(page: Page, config: EnduranceConfig, report: EnduranceReport) {
  // Driver queries can synchronize GPU work; collect identity before audio owns a real-time clock.
  report.report.details.graphics = await liveGraphicsIdentity(page, config.graphics);
  await report.checkpoint();
  const controls = config.operatorWindow ? await openOperator(page) : page;
  await prepareControls(controls, page);
  return controls;
}

async function openOperator(page: Page) {
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Operator window', exact: true }).click();
  const controls = await popup;
  await controls.getByRole('button', { name: 'Start input', exact: true }).waitFor();
  return controls;
}

async function startInput(page: Page, output: Page) {
  await page.getByRole('button', { name: 'Start input', exact: true }).click();
  await output.locator('main[data-capture=running][data-input-available=true]').waitFor();
}

async function startJournal(page: Page) {
  await page.getByRole('button', { name: 'Start journal', exact: true }).click();
  await page.getByRole('button', { name: 'Finish journal', exact: true }).waitFor();
}

async function finishJournal(page: Page) {
  await page.getByRole('button', { name: 'Finish journal', exact: true }).click();
  await page.getByText(/^Saved to /).waitFor();
}

async function restart(page: Page, output: Page) {
  await finishJournal(page);
  await page.getByRole('button', { name: 'Stop input', exact: true }).click();
  await output.locator('main[data-capture=stopped]').waitFor();
  await startInput(page, output);
  const frame = Number(await output.locator('main').getAttribute('data-frame'));
  assert(frame < 120, `Capture restart retained old frame ${frame}`);
  await startJournal(page);
}

async function changeScene(page: Page, index: number) {
  const button = page.locator(`.sc-scene-pads button[title="saved-scene-${index}"]`);
  await button.click();
  await page
    .locator(`.sc-scene-pads button[title="saved-scene-${index}"][aria-pressed=true]`)
    .waitFor();
  await page.getByLabel('Announcement text', { exact: true }).fill(`Scene ${index}`);
  await page.getByRole('button', { name: 'Announce', exact: true }).click();
}

async function sample(page: Page, report: EnduranceReport, controls: Page) {
  const operator = await controls.evaluate(() => ({
    diagnostics: document.querySelector('.sc-live-diagnostics summary')?.textContent,
    notices: [...document.querySelectorAll('[role=alert]')]
      .slice(0, 10)
      .map((element) => element.textContent),
  }));
  const snapshot = await page.locator('main').evaluate((main) => ({
    frame: Number(main.getAttribute('data-frame')),
    capture: main.getAttribute('data-capture'),
    dropped: Number(main.getAttribute('data-dropped')),
    cached: Number(main.getAttribute('data-cached')),
    pcmCapacity: Number(main.getAttribute('data-pcm-capacity')),
    scale: Number(main.getAttribute('data-render-scale')),
    hidden: document.hidden,
    heapBytes:
      (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory
        ?.usedJSHeapSize ?? null,
    nodes: document.getElementsByTagName('*').length,
  }));
  const fps = operator.diagnostics?.match(/([\d.]+) \/ ([\d.]+) FPS/);
  await report.event('sample', {
    ...snapshot,
    ...operator,
    renderFps: fps ? Number(fps[1]) : null,
    targetFps: fps ? Number(fps[2]) : null,
    captureEpoch: report.report.actions.restart ?? 0,
    nodeRssBytes: process.memoryUsage().rss,
  });
  assert.equal(snapshot.capture, 'running', 'Capture stopped during endurance workload');
  assert.equal(snapshot.dropped, 0, 'Capture dropped analysis samples');
  assert(snapshot.cached <= 2048, 'Feature cache exceeded its bound');
  assert(snapshot.pcmCapacity > 0, 'PCM buffer was not allocated');
  assert(snapshot.scale >= 0.25 && snapshot.scale <= 1, 'Adaptive resolution left its valid range');
}

async function validateJournals(root: string, report: EnduranceReport) {
  const files = (await readdir(root)).filter((name) => name.endsWith('.jsonl'));
  let scenes = 0;
  let announcements = 0;
  for (const file of files) {
    const journal = readSession(await readFile(join(root, file), 'utf8'));
    assert.equal(journal.events.at(-1)?.type, 'end', `${file} did not close`);
    scenes += journal.events.filter((event) => event.type === 'scene').length;
    announcements += journal.events.filter((event) => event.type === 'announcement').length;
  }
  assert(files.length > 0, 'No session journals were written');
  assert(
    announcements >= (report.report.actions['scene-and-announcement'] ?? 0),
    'Scene announcements were missing from journals',
  );
  report.report.details.journals = { files: files.length, scenes, announcements };
}

async function prepareControls(page: Page, output: Page) {
  await startInput(page, output);
  await page.locator('.sc-live-journal summary').click();
  await startJournal(page);
  await page.getByLabel('Start on next bar').uncheck();
  await page.getByLabel('Scene transition', { exact: true }).selectOption('0.5');
  await page.locator('.sc-live-branding summary').click();
}
