import { writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import type { Page } from 'playwright';
import {
  framesWithinMix,
  SetcastError,
  type ResolvedProject,
  type StillOptions,
  type StillResult,
} from '@setcast/core';
import { prepareFrame, withCapture, withRenderSession } from './session.ts';
import { atomicOutput } from './output.ts';
import { graphicsArgs } from './graphics.ts';
import { captureWebp } from './webp.ts';

export function still(project: ResolvedProject, options: StillOptions): Promise<StillResult> {
  graphicsArgs(options.gl);
  const extension = extname(options.out).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.webp'].includes(extension))
    throw new SetcastError(`Cannot write still ${options.out}.`, 'Use .png, .jpg or .webp.');
  const frame = Math.min(
    framesWithinMix(project.mix.duration, project.fps) - 1,
    Math.max(0, Math.round((options.at ?? project.mix.duration / 4_000_000) * project.fps)),
  );
  if (!Number.isFinite(frame))
    throw new SetcastError(`Invalid still time ${options.at}.`, 'Use a finite time in seconds.');
  return withRenderSession(() =>
    atomicOutput(options.out, options.signal, async (temporary) => {
      await withCapture(project, options, async (page) => {
        await prepareFrame(page, frame);
        await captureImage(page, temporary, options);
      });
      options.onProgress?.({ stage: 'frames', progress: 1, renderedFrames: 1, totalFrames: 1 });
      return { file: resolve(options.out), timeSeconds: frame / project.fps };
    }),
  );
}

async function captureImage(page: Page, temporary: string, options: StillOptions) {
  const extension = extname(options.out).toLowerCase();
  if (extension !== '.webp') {
    const type = extension === '.png' ? 'png' : 'jpeg';
    await page.screenshot({
      path: temporary,
      type,
      quality: type === 'jpeg' ? (options.jpegQuality ?? 95) : undefined,
    });
    return;
  }
  await writeFile(temporary, await captureWebp(page));
}
