import assert from 'node:assert/strict';
import type { Page, CDPSession } from 'playwright';
import type { ResolvedProject } from '@setcast/core';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadProject, probeAudio, readsWholeSet, readWholeSet } from '@setcast/core/node';
import { themes } from '../../themes/src/index.ts';
import { prepareFrame, withCapture, withRenderSession } from '../src/export/session.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    theme: { type: 'string' },
    'bitmap-resources': { type: 'boolean', default: false },
  },
});
if (!values.out || positionals.length !== 1) throw new Error('Pass PROJECT --out NEW_DIRECTORY.');
const out = resolve(values.out),
  projectDir = resolve(positionals[0]!);
await mkdir(out);
const results: unknown[] = [];
const lifecycles: unknown[] = [];
const frames = [2700, 0, 89, 90, 29, 30, 3312, 2715, 2700];
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
      await captureVariant(project, theme, portrait);
      process.stdout.write(`${theme} ${portrait ? 'portrait' : 'landscape'}: captured\n`);
    }
  }
});

interface BitmapProbe {
  active: Set<string>;
  created: number;
  revoked: number;
  peak: number;
}
declare global {
  interface Window {
    bitmapVideoProbe: BitmapProbe;
  }
}
async function captureVariant(project: ResolvedProject, theme: string, portrait: boolean) {
  await withCapture(project, { projectDir }, async (page) => {
    if (values['bitmap-resources']) await watchBitmapUrls(page);
    const cdp = await page.context().newCDPSession(page);
    for (const [index, frame] of frames.entries())
      await recordFrame(page, cdp, { theme, portrait, index, frame });
    await cdp.detach();
    if (values['bitmap-resources']) {
      await page.evaluate(() => window.setcastExport!.close());
      await page.waitForFunction(() => window.bitmapVideoProbe.active.size === 0);
      lifecycles.push({ theme, portrait, ...(await resourceSnapshot(page)) });
      await save();
    }
  });
}

async function recordFrame(
  page: Page,
  cdp: CDPSession,
  sample: { theme: string; portrait: boolean; index: number; frame: number },
) {
  const timings = await prepareFrame(page, sample.frame);
  const captured = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    optimizeForSpeed: true,
    captureBeyondViewport: false,
  });
  const bytes = Buffer.from(captured.data, 'base64');
  const file = `${sample.theme}-${sample.portrait ? 'portrait' : 'landscape'}-${sample.index}.png`;
  await writeFile(join(out, file), bytes);
  const hash = execFileSync(
    'ffmpeg',
    [
      '-nostdin',
      '-v',
      'error',
      '-threads',
      '1',
      '-i',
      join(out, file),
      '-filter_threads',
      '1',
      '-pix_fmt',
      'rgba',
      '-frames:v',
      '1',
      '-f',
      'hash',
      '-hash',
      'sha256',
      '-',
    ],
    { timeout: 30000, killSignal: 'SIGKILL' },
  )
    .toString()
    .trim();
  const resources = values['bitmap-resources'] ? await resourceSnapshot(page) : undefined;
  if (resources)
    assert.equal(resources.active, 1, 'A ready single-video scene must own exactly one bitmap URL');
  results.push({ ...sample, file, hash, timings, resources });
  await save();
}

function save() {
  return writeFile(
    join(out, 'report.json'),
    JSON.stringify({ version: 1, projectDir, frames, results, lifecycles }, null, 2) + '\n',
  );
}

async function resourceSnapshot(page: Page) {
  return page.evaluate(() => {
    const state = window.bitmapVideoProbe;
    return {
      active: state.active.size,
      created: state.created,
      revoked: state.revoked,
      peak: state.peak,
    };
  });
}

async function watchBitmapUrls(page: Page) {
  await page.evaluate(() => {
    const state = { active: new Set<string>(), created: 0, revoked: 0, peak: 0 };
    window.bitmapVideoProbe = state;
    const create = URL.createObjectURL.bind(URL),
      revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (source) => {
      const url = create(source);
      if (source instanceof Blob && source.type === 'image/bmp') {
        state.active.add(url);
        state.created++;
        state.peak = Math.max(state.peak, state.active.size);
      }
      return url;
    };
    URL.revokeObjectURL = (url) => {
      if (state.active.delete(url)) state.revoked++;
      revoke(url);
    };
  });
}
