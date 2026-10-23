import assert from 'node:assert/strict';
import type { Page } from 'playwright';
import type { GpuRecoveryWorkload } from './config.ts';

/** Loss is injected through the browser extension; production still owns restoration handling. */
export async function recoverGpu(page: Page, config: GpuRecoveryWorkload) {
  const before = Number(await page.locator('main').getAttribute('data-frame'));
  const started = performance.now();
  const canvases = await page.evaluate(injectRecovery, config.restoreSeconds);
  await page.waitForFunction(
    (count) =>
      document.querySelectorAll('.sc-live-scene[data-ready=true] canvas[data-gpu-state=ready]')
        .length === count,
    canvases.length,
  );
  await page.waitForFunction(
    (frame) => Number(document.querySelector('main')?.getAttribute('data-frame')) > frame,
    before,
  );
  assert.equal(await page.locator('main').getAttribute('data-capture'), 'running');
  assert.equal(await page.locator('main').getAttribute('data-dropped'), '0');
  return { canvases, seconds: (performance.now() - started) / 1000 };
}

function injectRecovery(seconds: number) {
  const targets = [
    ...document.querySelectorAll<HTMLCanvasElement>(
      '.sc-live-scene[data-ready=true] canvas[data-gpu-state=ready]',
    ),
  ];
  if (!targets.length) throw new Error('GPU recovery workload has no ready shader canvases.');
  return Promise.all(
    targets.map(
      (canvas) =>
        new Promise<string>((resolve, reject) => {
          const extension = canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context');
          if (!extension) return reject(new Error('WEBGL_lose_context is unavailable.'));
          const timeout = setTimeout(
            () => reject(new Error('Injected GPU loss did not restore within 20 seconds.')),
            20_000,
          );
          canvas.addEventListener(
            'webglcontextlost',
            () => {
              setTimeout(() => extension.restoreContext(), seconds * 1000);
            },
            { once: true },
          );
          canvas.addEventListener(
            'webglcontextrestored',
            () => {
              clearTimeout(timeout);
              resolve(canvas.className);
            },
            { once: true },
          );
          extension.loseContext();
        }),
    ),
  );
}
