import { installBrowser } from '@setcast/renderer-browser/export';
import { parseCommandArgs } from '../args.ts';

export const help = `setcast browser-install

Download the pinned Chromium runtime for the experimental browser exporter.
System FFmpeg must also be available on PATH for video and WebP export.`;

export async function run(argv: string[]) {
  parseCommandArgs(argv, {}, help);
  await installBrowser();
}
