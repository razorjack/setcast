import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type Page } from 'playwright';
import { framesWithinMix, type ResolvedProject } from '@setcast/core';
import { loadProject, probeAudio, WholeSetReader } from '@setcast/core/node';
import { themes } from '../../themes/src/index.ts';
import { bundlePlayer } from '../src/bundle.ts';
import { serveCapture } from '../src/server.ts';
import { captureBrowserArgs } from '../src/export/graphics.ts';
import { prepareFrame } from '../src/export/session.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    theme: { type: 'string', default: 'all' },
    frames: { type: 'string', default: '3149,3150,3151,3029,3030,3149' },
    'executable-path': { type: 'string' },
  },
});
if (!values.out || positionals.length !== 1)
  throw new Error(
    'Pass PROJECT --out NEW_DIRECTORY [--theme all|NAME] [--frames CSV] [--executable-path FILE].',
  );
const projectDir = resolve(positionals[0]!);
const out = resolve(values.out);
const frames = values.frames.split(',').map(Number);
if (!frames.length || frames.some((frame) => !Number.isSafeInteger(frame) || frame < 0))
  throw new Error('Frames must be nonnegative integers.');
await mkdir(out);
const args = [...captureBrowserArgs(), '--enable-blink-features=CanvasDrawElement'];
const browser = await chromium.launch({ args, executablePath: values['executable-path'] });
const files = await bundlePlayer('export.tsx');
const reader = new WholeSetReader();
const report = {
  version: 1,
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  projectDir,
  chromium: browser.version(),
  executable: values['executable-path'] ?? chromium.executablePath(),
  args,
  scope:
    'Independent export driver. Native DOM paint versus PNG screenshot in the same browser. Pixel qualification only, not throughput. No DOM reconstruction fallback.',
  status: 'running',
  error: null as string | null,
  results: [] as unknown[],
};
const save = () => writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
try {
  for (const theme of values.theme === 'all' ? Object.keys(themes) : [values.theme]) {
    const loaded = await loadProject(projectDir, {
      themes,
      theme,
      probeDuration: (audio, root) => probeAudio({ audio }, root),
    });
    const prepared = await reader.read(loaded.project, projectDir);
    if (frames.some((frame) => frame >= framesWithinMix(prepared.mix.duration, prepared.fps)))
      throw new Error('Requested frame exceeds the project duration.');
    for (const [width, height] of [
      [1920, 1080],
      [1080, 1920],
    ]) {
      const project = { ...prepared, width: width!, height: height! };
      await compareComposition(project, theme);
    }
  }
  report.status = 'measured';
} catch (error) {
  report.status = 'failed';
  report.error = String(error);
  throw error;
} finally {
  await browser.close();
  await save();
}

interface NativeCanvas extends HTMLCanvasElement {
  requestPaint(): void;
}
type NativeContext = CanvasRenderingContext2D;
declare global {
  interface Window {
    nativeCaptureProbe: { canvas: NativeCanvas; context: NativeContext; target: HTMLElement };
  }
}

function installNative(page: Page, width: number, height: number) {
  return page.evaluate(
    ({ width, height }) => {
      const canvas = document.createElement('canvas') as NativeCanvas;
      const context = canvas.getContext('2d', {
        alpha: false,
        colorSpace: 'srgb',
      }) as NativeContext;
      if (
        typeof context.drawElementImage !== 'function' ||
        typeof canvas.requestPaint !== 'function'
      )
        throw new Error('Native DOM capture API unavailable.');
      const target = document.getElementById('player')!;
      canvas.width = width;
      canvas.height = height;
      canvas.setAttribute('content', 'drawable');
      canvas.style.cssText = `display:block;width:${width}px;height:${height}px;`;
      target.setAttribute('drawable', '');
      target.style.width = `${width}px`;
      target.style.height = `${height}px`;
      target.replaceWith(canvas);
      canvas.append(target);
      window.nativeCaptureProbe = { canvas, context, target };
    },
    { width, height },
  );
}

function captureNative(page: Page) {
  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const { canvas, context, target } = window.nativeCaptureProbe;
        const timer = setTimeout(() => {
          canvas.removeEventListener('paint', paint);
          reject(new Error('Native paint did not arrive within 10 seconds.'));
        }, 10_000);
        function paint() {
          clearTimeout(timer);
          try {
            context.reset();
            context.drawElementImage(target, 0, 0);
            resolve(canvas.toDataURL('image/png').split(',')[1]!);
          } catch (error) {
            reject(error);
          }
        }
        canvas.addEventListener('paint', paint, { once: true });
        canvas.requestPaint();
      }),
  );
}

function comparePixels(page: Page, screenshot: string, native: string) {
  return page.evaluate(
    async ({ screenshot, native }) => {
      async function decode(value: string) {
        const image = new Image();
        image.src = `data:image/png;base64,${value}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d', { colorSpace: 'srgb' })!;
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, canvas.width, canvas.height).data;
      }
      const [first, second] = await Promise.all([decode(screenshot), decode(native)]);
      if (first.length !== second.length)
        throw new Error('Native capture changed frame dimensions.');
      let changedPixels = 0,
        maximum = 0,
        total = 0;
      for (let pixel = 0; pixel < first.length; pixel += 4) {
        let changed = false;
        for (let channel = 0; channel < 4; channel++) {
          const delta = Math.abs(first[pixel + channel]! - second[pixel + channel]!);
          changed ||= delta > 0;
          maximum = Math.max(maximum, delta);
          total += delta;
        }
        if (changed) changedPixels++;
      }
      const digest = async (data: Uint8ClampedArray<ArrayBuffer>) =>
        [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))]
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('');
      return {
        changedPixels,
        maximum,
        mean: total / first.length,
        screenshotHash: await digest(first),
        nativeHash: await digest(second),
        exact: changedPixels === 0,
        withinSourcePrecision:
          maximum <= 1 && changedPixels <= Math.ceil((first.length / 4) * 0.00001),
      };
    },
    { screenshot, native },
  );
}

async function compareComposition(project: ResolvedProject, theme: string) {
  const server = await serveCapture(project, { projectDir, files });
  const context = await browser.newContext({
    viewport: { width: project.width, height: project.height },
    deviceScaleFactor: 1,
  });
  try {
    const ordinary = await context.newPage(),
      native = await context.newPage();
    for (const page of [ordinary, native]) {
      await page.goto(server.url);
      await page.waitForFunction(() => Boolean(window.setcastExport));
    }
    await installNative(native, project.width, project.height);
    const directory = join(out, `${theme}-${project.width}x${project.height}`);
    await mkdir(directory);
    await compareFrames(ordinary, native, project, directory);
    process.stdout.write(`${theme} ${project.width}x${project.height}: ${frames.length} samples\n`);
  } finally {
    await context.close();
    await server.close();
  }
}

async function compareFrames(
  ordinary: Page,
  native: Page,
  project: ResolvedProject,
  directory: string,
) {
  for (const [index, frame] of frames.entries()) {
    await prepareFrame(ordinary, frame);
    const screenshot = await ordinary.screenshot({ type: 'png' });
    await prepareFrame(native, frame);
    const captured = await captureNative(native);
    const comparison = await comparePixels(ordinary, screenshot.toString('base64'), captured);
    report.results.push({
      theme: project.theme,
      width: project.width,
      height: project.height,
      index,
      frame,
      ...comparison,
    });
    if (index === 0 || comparison.maximum > 1) {
      await writeFile(join(directory, `${index}-${frame}-screenshot.png`), screenshot);
      await writeFile(
        join(directory, `${index}-${frame}-native.png`),
        Buffer.from(captured, 'base64'),
      );
    }
    await save();
  }
}
