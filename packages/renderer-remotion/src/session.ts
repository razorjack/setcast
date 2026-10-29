import { AsyncLocalStorage } from 'node:async_hooks';
import { rm } from 'node:fs/promises';
import { bundle } from '@remotion/bundler';
import { ensureBrowser, openBrowser, selectComposition } from '@remotion/renderer';
import {
  readMixDocument,
  SetcastError,
  type GraphicsBackend,
  type ResolvedProject,
  type RuntimeReport,
} from '@setcast/core';
import { observeRenderBrowser } from '@setcast/core/node';
import type { RenderProgress } from './index.ts';
import { checkLocalServer } from './local-server.ts';
import { ENTRY, PACKAGE_ROOT } from './paths.ts';
import { probeAudio } from './probe.ts';
import { graphicsOptions } from './graphics.ts';

type Options = { projectDir: string; gl?: GraphicsBackend; onRuntime?: RuntimeReport };
type Report = (progress: RenderProgress) => void;
type Browser = Awaited<ReturnType<typeof openBrowser>>;
type Composition = Awaited<ReturnType<typeof selectComposition>>;
type Resources = { serveUrl: string; puppeteerInstance: Browser };
const sessions = new AsyncLocalStorage<RenderSession>();

/** Reuses preparation for a batch and closes its browser and temporary bundles on every exit. */
export async function withRenderSession<T>(task: () => Promise<T>): Promise<T> {
  if (sessions.getStore()) return task();
  const session = new RenderSession();
  try {
    return await sessions.run(session, task);
  } finally {
    await session.close();
  }
}

export function currentSession(): RenderSession {
  const session = sessions.getStore();
  if (!session) throw new Error('Renderer preparation needs an active session.');
  return session;
}

class RenderSession {
  private readonly resources = new Map<string, Promise<Resources>>();
  private readonly compositions = new WeakMap<ResolvedProject, Map<string, Promise<Composition>>>();
  private readonly browsers = new Set<Browser>();
  private readonly bundles = new Set<string>();

  async prepare(project: ResolvedProject, options: Options, report: Report) {
    const key = JSON.stringify([options.projectDir, options.gl]);
    let compositions = this.compositions.get(project);
    if (!compositions) {
      compositions = new Map();
      this.compositions.set(project, compositions);
    }
    if (!compositions.has(key)) {
      readMixDocument(project.mix);
      await probeAudio(project, options.projectDir);
    }
    if (!this.resources.has(key)) this.resources.set(key, this.start(options, report));
    const resources = await this.resources.get(key)!;
    if (options.onRuntime) await observeBrowser(resources.puppeteerInstance, options.onRuntime);
    if (!compositions.has(key))
      compositions.set(
        key,
        selectComposition({
          ...resources,
          id: 'setcast',
          inputProps: project,
          chromiumOptions: graphicsOptions(options.gl),
        }),
      );
    return { ...resources, composition: await compositions.get(key)! };
  }

  private async start(options: Options, report: Report): Promise<Resources> {
    await checkLocalServer();
    await browserAvailable(report);
    const serveUrl = await bundle({
      entryPoint: ENTRY,
      rootDir: PACKAGE_ROOT,
      publicDir: options.projectDir,
      symlinkPublicDir: true,
      onProgress: (percent) => report({ stage: 'bundle', progress: percent / 100 }),
    });
    this.bundles.add(serveUrl);
    const puppeteerInstance = await openBrowser('chrome', {
      chromiumOptions: graphicsOptions(options.gl),
    });
    this.browsers.add(puppeteerInstance);
    return { serveUrl, puppeteerInstance };
  }

  async close(): Promise<void> {
    try {
      await Promise.all([...this.browsers].map((browser) => browser.close({ silent: true })));
    } finally {
      await Promise.all(
        [...this.bundles]
          .filter((path) => !/^https?:/.test(path))
          .map((path) => rm(path, { recursive: true, force: true })),
      );
    }
  }
}

async function observeBrowser(browser: Browser, report: RuntimeReport) {
  const page = await browser.newPage({
    context: () => null,
    logLevel: 'error',
    indent: false,
    pageIndex: 0,
    onBrowserLog: null,
    onLog: () => {},
  });
  try {
    report(await page.evaluate(observeRenderBrowser));
  } finally {
    await page.close();
  }
}

async function browserAvailable(report: Report): Promise<void> {
  let downloadingBrowser = false;
  try {
    await ensureBrowser({
      onBrowserDownload: () => {
        downloadingBrowser = true;
        report({ stage: 'browser', progress: 0 });
        return {
          version: null,
          onProgress: ({ percent }) => report({ stage: 'browser', progress: percent }),
        };
      },
    });
  } catch (cause) {
    if (!downloadingBrowser) throw cause;
    throw new SetcastError(
      'Cannot download Chrome Headless Shell',
      "Check your internet connection. Delete the renderer package's node_modules/.remotion directory to retry the download.",
      { cause, exitCode: 1 },
    );
  }
  report({ stage: 'browser', progress: 1 });
}
