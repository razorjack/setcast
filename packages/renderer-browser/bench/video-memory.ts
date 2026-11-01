import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { Page, CDPSession } from 'playwright';
import { loadProject, probeAudio, readsWholeSet, readWholeSet } from '@setcast/core/node';
import { toSeconds } from '@setcast/core';
import { themes } from '../../themes/src/index.ts';
import { parseProcesses, processDelta } from '../../../scripts/render-compare/process-snapshot.ts';
import { prepareFrame, withCapture, withRenderSession } from '../src/export/session.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    frames: { type: 'string', default: '3000' },
    bitmap: { type: 'boolean', default: false },
  },
});
const frames = Number(values.frames);
if (!values.out || positionals.length !== 1 || !Number.isSafeInteger(frames) || frames < 300)
  throw new Error('Pass PROJECT --out NEW_DIRECTORY [--frames INTEGER_AT_LEAST_300] [--bitmap].');
const out = resolve(values.out),
  projectDir = resolve(positionals[0]!);
await mkdir(out);
const loaded = await loadProject(projectDir, {
  themes,
  probeDuration: (audio, root) => probeAudio({ audio }, root),
});
const project = readsWholeSet(loaded.project)
  ? await readWholeSet(loaded.project, projectDir)
  : loaded.project;
if (project.fps !== 30 || toSeconds(project.mix.duration) < 110)
  throw new Error('Video memory fixture requires 30 fps and at least 110 seconds of finite audio.');
const control = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => control.abort(new Error(`Stopped by ${signal}`)));
const report = {
  version: 1,
  projectDir,
  frames,
  bitmap: values.bitmap,
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  scope:
    'Repeated 100–110 second seeks with JPEG capture. Resource check, not an encoded export or speed comparison. Summed RSS may double-count shared pages; external GPU services are excluded.',
  samples: [] as unknown[],
  status: 'running',
  error: null as string | null,
};
const save = () => writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
try {
  await withRenderSession(async () => {
    await withCapture(project, { projectDir, signal: control.signal }, async (page) => {
      if (values.bitmap) await watchUrls(page);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Performance.enable');
      for (let index = 0; index < frames; index++) {
        control.signal.throwIfAborted();
        await prepareFrame(page, 3000 + (index % 300));
        await page.screenshot({ type: 'jpeg', quality: 95 });
        if (index % 150 === 0 || index === frames - 1) await sample(page, cdp, index + 1);
      }
      await page.evaluate(() => window.setcastExport!.close());
      if (values.bitmap) await page.waitForFunction(() => window.videoMemoryUrls.active.size === 0);
      await sample(page, cdp, frames, true);
      await cdp.detach();
    });
  });
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = String(error);
  throw error;
} finally {
  await save();
}

async function sample(page: Page, cdp: CDPSession, captured: number, closed = false) {
  const metrics = await cdp.send('Performance.getMetrics');
  const heap = Object.fromEntries(
    metrics.metrics
      .filter(({ name }) =>
        ['JSHeapUsedSize', 'JSHeapTotalSize', 'Nodes', 'Documents'].includes(name),
      )
      .map(({ name, value }) => [name, value]),
  );
  const rows = parseProcesses(
    execFileSync('ps', ['-axo', 'pid=,ppid=,rss=,time=,lstart='], {
      encoding: 'utf8',
      env: { ...process.env, LC_ALL: 'C' },
      timeout: 2000,
    }),
  );
  const processTree = processDelta(new Map(), rows, process.pid);
  const urls = values.bitmap
    ? await page.evaluate(() => ({
        active: window.videoMemoryUrls.active.size,
        created: window.videoMemoryUrls.created,
        revoked: window.videoMemoryUrls.revoked,
        peak: window.videoMemoryUrls.peak,
      }))
    : null;
  if (urls) assert.equal(urls.active, closed ? 0 : 1);
  report.samples.push({ captured, closed, heap, treeRssBytes: processTree.rssBytes, urls });
  await save();
  process.stdout.write(`${captured}/${frames}${closed ? ' closed' : ''}\n`);
}

declare global {
  interface Window {
    videoMemoryUrls: { active: Set<string>; created: number; revoked: number; peak: number };
  }
}
async function watchUrls(page: Page) {
  await page.evaluate(() => {
    const state = { active: new Set<string>(), created: 0, revoked: 0, peak: 0 };
    window.videoMemoryUrls = state;
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
