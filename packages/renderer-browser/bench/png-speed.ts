import assert from 'node:assert/strict';
import type { Page, CDPSession } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadProject, probeAudio, readsWholeSet, readWholeSet } from '@setcast/core/node';
import { themes } from '../../themes/src/index.ts';
import { prepareFrame, withCapture, withRenderSession } from '../src/export/session.ts';

const { values } = parseArgs({
  options: { out: { type: 'string' }, project: { type: 'string' }, theme: { type: 'string' } },
});
if (!values.out) throw new Error('Pass --out NEW_DIRECTORY.');
const out = resolve(values.out),
  projectDir = resolve(values.project ?? 'examples/demo');
await mkdir(out);
const results: unknown[] = [];
await withRenderSession(async () => {
  for (const theme of values.theme ? [values.theme] : Object.keys(themes)) {
    const loaded = await loadProject(projectDir, {
      themes,
      theme,
      probeDuration: (audio, root) => probeAudio({ audio }, root),
    });
    const prepared = readsWholeSet(loaded.project)
      ? await readWholeSet(loaded.project, projectDir)
      : loaded.project;
    for (const portrait of [false, true]) {
      const project = {
        ...prepared,
        width: portrait ? 1080 : 1920,
        height: portrait ? 1920 : 1080,
      };
      await withCapture(project, { projectDir }, async (page) => {
        const cdp = await page.context().newCDPSession(page);
        for (const at of [30, 90, 110.4]) {
          await compareFrame(page, cdp, { theme, portrait, at, fps: project.fps });
        }
        await cdp.detach();
      });
      process.stdout.write(`${theme} ${portrait ? 'portrait' : 'landscape'}: exact\n`);
    }
  }
});

function pixelHash(png: Buffer) {
  return execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', 'pipe:0', '-pix_fmt', 'rgba', '-f', 'hash', '-hash', 'sha256', '-'],
    { input: png },
  ).toString();
}

async function compareFrame(
  page: Page,
  cdp: CDPSession,
  fixture: { theme: string; portrait: boolean; at: number; fps: number },
) {
  const { theme, portrait, at } = fixture;
  await prepareFrame(page, Math.round(at * fixture.fps));
  const start = performance.now();
  const normal = await page.screenshot({ type: 'png' });
  const normalMs = performance.now() - start;
  const fastStart = performance.now();
  const response = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    optimizeForSpeed: true,
    captureBeyondViewport: false,
  });
  const fast = Buffer.from(response.data, 'base64');
  const fastMs = performance.now() - fastStart;
  const equal = pixelHash(normal) === pixelHash(fast);
  results.push({
    theme,
    portrait,
    at,
    equal,
    normalMs,
    fastMs,
    normalBytes: normal.length,
    fastBytes: fast.length,
  });
  if (!equal) {
    const name = `${theme}-${portrait ? 'portrait' : 'landscape'}-${at}`;
    await writeFile(join(out, `${name}-normal.png`), normal);
    await writeFile(join(out, `${name}-fast.png`), fast);
  }
  await writeFile(
    join(out, 'report.json'),
    JSON.stringify(
      {
        scope: 'Exact PNG decode comparison; timings are diagnostic under shared load.',
        results,
      },
      null,
      2,
    ) + '\n',
  );
  assert(equal, `PNG pixels differ: ${theme}, portrait=${portrait}, at=${at}`);
}
