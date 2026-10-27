import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Page } from 'playwright';
import {
  defaultStillTime,
  framesWithinMix,
  requireStillFormat,
  type StillFormat,
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
  const format = requireStillFormat(options.out);
  const frame = Math.min(
    framesWithinMix(project.mix.duration, project.fps) - 1,
    Math.max(0, Math.round((options.at ?? defaultStillTime(project.mix)) * project.fps)),
  );
  if (!Number.isFinite(frame))
    throw new SetcastError(`Invalid still time ${options.at}.`, 'Use a finite time in seconds.');
  return withRenderSession(() =>
    atomicOutput(options.out, options.signal, async (temporary) => {
      await withCapture(project, options, async (page) => {
        await prepareFrame(page, frame);
        await captureImage(page, temporary, format, options.jpegQuality);
      });
      options.onProgress?.({ stage: 'frames', progress: 1, renderedFrames: 1, totalFrames: 1 });
      return { file: resolve(options.out), timeSeconds: frame / project.fps };
    }),
  );
}

async function captureImage(page: Page, temporary: string, format: StillFormat, jpegQuality = 95) {
  if (format === 'webp') {
    await writeFile(temporary, await captureWebp(page));
    return;
  }
  await page.screenshot({
    path: temporary,
    type: format,
    quality: format === 'jpeg' ? jpegQuality : undefined,
  });
}
