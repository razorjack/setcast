import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { chromium, type Browser, type Page } from 'playwright';
import {
  SetcastError,
  type GraphicsBackend,
  type ResolvedProject,
  type StillOptions,
} from '@setcast/core';
import { bundlePlayer } from '../bundle.ts';
import { captureBrowserArgs } from './graphics.ts';
import { play } from '../index.ts';
import { restrictResources, assertResources } from './resources.ts';
import type {} from './scene.tsx';

interface Session {
  browsers: Map<string, Promise<Browser>>;
  files: Promise<Map<string, Buffer>> | null;
}
const sessions = new AsyncLocalStorage<Session>();

type CaptureOptions = Pick<StillOptions, 'projectDir' | 'gl' | 'signal' | 'onProgress'> & {
  assetPaths?: readonly string[];
};

async function captureBundle(options: CaptureOptions) {
  const session = sessions.getStore()!;
  options.onProgress?.({ stage: 'bundle', progress: 0 });
  session.files ??= bundlePlayer('export.tsx');
  const files = await session.files;
  options.onProgress?.({ stage: 'bundle', progress: 1 });
  return files;
}

async function captureBrowser(options: CaptureOptions) {
  options.signal?.throwIfAborted();
  const session = sessions.getStore()!;
  const backend = options.gl ?? 'auto';
  if (!session.browsers.has(backend)) session.browsers.set(backend, launch(backend));
  options.onProgress?.({ stage: 'browser', progress: 0 });
  const browser = await session.browsers.get(backend)!;
  options.onProgress?.({ stage: 'browser', progress: 1 });
  return browser;
}

export async function exportRuntime(options: CaptureOptions) {
  const files = await captureBundle(options);
  const hash = createHash('sha256');
  for (const [path, bytes] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(path);
    hash.update(bytes);
  }
  const browser = await captureBrowser(options);
  return { bundle: hash.digest('hex'), chromium: browser.version() };
}

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

/** A capture page showing `project`, served by its own read-only player server. */
interface Capture extends AsyncDisposable {
  page: Page;
}

async function openCapture(project: ResolvedProject, options: CaptureOptions): Promise<Capture> {
  options.signal?.throwIfAborted();
  const files = await captureBundle(options);
  const server = await play(project, {
    projectDir: options.projectDir,
    port: 0,
    captureFiles: files,
  });
  let page: Page | undefined;
  const abort = () => {
    void page?.close().catch(() => {});
  };
  const close = async () => {
    options.signal?.removeEventListener('abort', abort);
    try {
      await page?.close();
    } finally {
      await server.close();
    }
  };
  try {
    const browser = await captureBrowser(options);
    page = await browser.newPage({
      viewport: { width: project.width, height: project.height },
      deviceScaleFactor: 1,
    });
    options.signal?.addEventListener('abort', abort, { once: true });
    options.signal?.throwIfAborted();
    if (options.assetPaths) await restrictResources(page, server.url, options.assetPaths, files);
    await page.goto(server.url);
    await page.waitForFunction(() => Boolean(window.setcastExport));
    return { page, [Symbol.asyncDispose]: close };
  } catch (error) {
    try {
      throw captureFailure(error, options, page ? [page] : []);
    } finally {
      await close();
    }
  }
}

/** Abort first, then a blocked resource, which usually explains why a page failed. */
function captureFailure(error: unknown, options: CaptureOptions, pages: Page[]): unknown {
  options.signal?.throwIfAborted();
  for (const page of pages) assertResources(page);
  return error;
}

/** Runs `task` with `count` capture pages open and closes them when it settles. */
export async function withCapturePages<T>(
  project: ResolvedProject,
  options: CaptureOptions,
  count: number,
  task: (pages: Page[]) => Promise<T>,
): Promise<T> {
  await using captures = new AsyncDisposableStack();
  const pages: Page[] = [];
  for (let opened = 0; opened < count; opened++) {
    pages.push(captures.use(await openCapture(project, options)).page);
  }
  try {
    const result = await task(pages);
    for (const page of pages) assertResources(page);
    return result;
  } catch (error) {
    throw captureFailure(error, options, pages);
  }
}

export function withCapture<T>(
  project: ResolvedProject,
  options: CaptureOptions,
  task: (page: Page) => Promise<T>,
): Promise<T> {
  return withCapturePages(project, options, 1, ([page]) => task(page!));
}

async function launch(backend: GraphicsBackend) {
  const args = captureBrowserArgs(backend);
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
    assertResources(page);
    return captured.timings!;
  } finally {
    clearTimeout(timer);
  }
}
