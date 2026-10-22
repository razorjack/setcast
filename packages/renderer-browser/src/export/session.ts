import { AsyncLocalStorage } from 'node:async_hooks';
import { chromium, type Browser, type Page } from 'playwright';
import {
  SetcastError,
  type GraphicsBackend,
  type ResolvedProject,
  type StillOptions,
} from '@setcast/core';
import { bundlePlayer } from '../bundle.ts';
import { graphicsArgs } from './graphics.ts';
import { play } from '../index.ts';
import type {} from './scene.tsx';

interface Session {
  browsers: Map<string, Promise<Browser>>;
  files: Promise<Map<string, Buffer>> | null;
}
const sessions = new AsyncLocalStorage<Session>();

export async function withRenderSession<T>(task: () => Promise<T>): Promise<T> {
  if (sessions.getStore()) return task();
  const session: Session = { browsers: new Map(), files: null };
  try {
    return await sessions.run(session, task);
  } finally {
    await Promise.allSettled(
      [...session.browsers.values()].map(async (browser) => (await browser).close()),
    );
    await session.files?.catch(() => {});
  }
}

export async function withCapture<T>(
  project: ResolvedProject,
  options: Pick<StillOptions, 'projectDir' | 'gl' | 'signal' | 'onProgress'>,
  task: (page: Page) => Promise<T>,
) {
  options.signal?.throwIfAborted();
  const session = sessions.getStore()!;
  options.onProgress?.({ stage: 'bundle', progress: 0 });
  session.files ??= bundlePlayer('export.tsx');
  const files = await session.files;
  options.onProgress?.({ stage: 'bundle', progress: 1 });
  const server = await play(project, {
    projectDir: options.projectDir,
    port: 0,
    captureFiles: files,
  });
  let page: Page | undefined;
  const abort = () => {
    void page?.close().catch(() => {});
  };
  try {
    const backend = options.gl ?? 'auto';
    if (!session.browsers.has(backend)) session.browsers.set(backend, launch(backend));
    options.onProgress?.({ stage: 'browser', progress: 0 });
    const browser = await session.browsers.get(backend)!;
    options.onProgress?.({ stage: 'browser', progress: 1 });
    page = await browser.newPage({
      viewport: { width: project.width, height: project.height },
      deviceScaleFactor: 1,
    });
    options.signal?.addEventListener('abort', abort, { once: true });
    options.signal?.throwIfAborted();
    await page.goto(server.url);
    await page.waitForFunction(() => Boolean(window.setcastExport));
    return await task(page);
  } catch (error) {
    options.signal?.throwIfAborted();
    throw error;
  } finally {
    options.signal?.removeEventListener('abort', abort);
    try {
      await page?.close();
    } finally {
      await server.close();
    }
  }
}

async function launch(backend: GraphicsBackend) {
  const args = [
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    ...graphicsArgs(backend),
  ];
  try {
    return await chromium.launch({ args });
  } catch (cause) {
    throw new SetcastError(
      'Cannot start the browser exporter Chromium runtime.',
      'Run `pnpm --filter @setcast/renderer-browser exec playwright install chromium` in a checkout, or `setcast browser-install` after installation.',
      { cause, exitCode: 1 },
    );
  }
}

export async function prepareFrame(page: Page, frame: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `Frame ${frame} exceeded 60 seconds. Check audio decoding and asset readiness.`,
          ),
        ),
      60_000,
    );
  });
  try {
    const captured = await Promise.race([
      page.evaluate(
        async (frame) => ({
          frame: await window.setcastExport!.frame(frame),
          timings: window.setcastExport!.timings,
        }),
        frame,
      ),
      timeout,
    ]);
    if (captured.frame !== frame)
      throw new Error(`Requested frame ${frame}, received ${captured.frame}.`);
    return captured.timings!;
  } finally {
    clearTimeout(timer);
  }
}
