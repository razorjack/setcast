import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { resolveVisualizerConfigs } from '@setcast/core';
import { loadProject } from '@setcast/core/node';
import { themes } from '@setcast/themes';
import { still, probeAudio } from '../src/index.ts';
import { PACKAGE_ROOT } from '../src/paths.ts';
import { currentSession, withRenderSession } from '../src/session.ts';

const projectDir = resolve('examples/demo');
const out = resolve('examples/demo/out/gpu-recovery-remotion');
await mkdir(out, { recursive: true });
const loaded = await loadProject(projectDir, {
  themes,
  probeDuration: (audio, root) => probeAudio({ audio }, root),
});
process.chdir(PACKAGE_ROOT);

await withRenderSession(async () => {
  for (const name of ['field', 'tunnel', 'constellation']) await check(name);
});
process.stdout.write(`gpu-recovery-remotion: PASS (${out})\n`);

async function check(name: string) {
  const project = {
    ...loaded.project,
    width: 640,
    height: 360,
    visualizers: resolveVisualizerConfigs({ name, seed: 42 }),
  };
  const reference = join(out, `${name}-reference.png`);
  await still(project, { projectDir, out: reference, at: 20 });
  const { puppeteerInstance: browser } = await currentSession().prepare(
    project,
    { projectDir },
    () => {},
  );
  const newPage = browser.newPage.bind(browser);
  let events = 0;
  browser.newPage = async (options) => {
    const page = await newPage({
      ...options,
      onBrowserLog: (log) => {
        if (log.text.includes('setcast-test-context-restored')) events++;
        options.onBrowserLog?.(log);
      },
    });
    await page.evaluateOnNewDocument(injectLoss, 800);
    return page;
  };
  try {
    const recovered = join(out, `${name}-recovered.png`);
    await still(project, { projectDir, out: recovered, at: 20 });
    assert(events > 0, 'The Remotion test never restored a lost context');
    assert(pixels(reference).equals(pixels(recovered)), `${name} recovery changed Remotion pixels`);
    const failing = {
      ...project,
      visualizers: resolveVisualizerConfigs({ name, recoverySeconds: 0.1 }),
    };
    await assert.rejects(
      still(failing, { projectDir, out: join(out, `${name}-failure.png`), at: 20 }),
      /lost its WebGL context/,
    );
  } finally {
    browser.newPage = newPage;
  }
  process.stdout.write(
    `${name}: Remotion waits for recovery, preserves pixels and fails on timeout\n`,
  );
}

function pixels(file: string) {
  return execFileSync('ffmpeg', [
    '-v',
    'error',
    '-i',
    file,
    '-frames:v',
    '1',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgba',
    'pipe:1',
  ]);
}

/** Run before the scene mounts, forcing loss inside its first actual GPU draw. */
function injectLoss(milliseconds: number) {
  const original = Object.getOwnPropertyDescriptor(WebGL2RenderingContext.prototype, 'drawArrays')!
    .value as WebGL2RenderingContext['drawArrays'];
  let lost = false;
  WebGL2RenderingContext.prototype.drawArrays = function (...args) {
    original.apply(this, args);
    if (lost) return;
    lost = true;
    const extension = this.getExtension('WEBGL_lose_context')!;
    this.canvas.addEventListener(
      'webglcontextlost',
      () => {
        setTimeout(() => extension.restoreContext(), milliseconds);
      },
      { once: true },
    );
    this.canvas.addEventListener(
      'webglcontextrestored',
      () => {
        console.warn('setcast-test-context-restored');
      },
      { once: true },
    );
    extension.loseContext();
  };
}
