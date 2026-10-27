import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { chromium, type Page } from 'playwright';

interface LiveBrowserOptions {
  /** Let audio and video play without a click, for checks that drive playback directly. */
  autoplay?: boolean;
  args?: string[];
}

/** Chromium with a fake audio input that the live player may open without a permission prompt. */
export function launchLiveBrowser({ autoplay = false, args = [] }: LiveBrowserOptions = {}) {
  const fakeInput = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'];
  const playback = autoplay ? ['--autoplay-policy=no-user-gesture-required'] : [];
  return chromium.launch({ args: [...fakeInput, ...playback, ...args] });
}

/** A new temporary directory holding `files`, keyed by their path inside it. */
export async function writeFixture(
  name: string,
  files: Record<string, string | Buffer>,
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `setcast-${name}-`));
  for (const [path, contents] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), contents);
  }
  return root;
}

/** The page's uncaught errors so far; a check asserts the list is empty when it finishes. */
export function pageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}
