import type { Page } from 'playwright';
import { SetcastError } from '@setcast/core';
import { assetUrl } from '../browser/url.ts';

const failures = new WeakMap<Page, Error>();
export async function restrictResources(
  page: Page,
  origin: string,
  paths: readonly string[],
  files: ReadonlyMap<string, Buffer>,
) {
  const allowed = new Set(
    ['/', ...files.keys(), '/project.json', ...paths.map(assetUrl)].map(
      (path) => new URL(path, origin).pathname,
    ),
  );
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (
      url.protocol === 'data:' ||
      url.protocol === 'blob:' ||
      (url.origin === origin && allowed.has(url.pathname) && !url.search)
    ) {
      await route.continue();
      return;
    }
    failures.set(
      page,
      new SetcastError(
        `Resumable export requested an untracked resource: ${url.href}.`,
        'Use project audio/background assets and embedded CSS resources, or render without --resume.',
      ),
    );
    await route.abort();
  });
}

export function assertResources(page: Page) {
  const error = failures.get(page);
  if (error) throw error;
}
