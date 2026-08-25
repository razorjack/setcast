import { mkdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { formatTime, parseTime, SetcastError, type SetEvent } from '@setcast/core';
import { still } from '@setcast/renderer-remotion';
import { load } from '../project.ts';
import { bold, clearSpinnerOnError, intro, outro, spinner, steel } from '../ui.ts';

export const help = `setcast still [dir] [--at MM:SS] [--out thumb.jpg]

Renders one frame as an image, ready to upload as the YouTube thumbnail.
  --at   the moment to grab; defaults to the first drop, or a quarter into the set
  --out  output file; .png, .jpg or .webp (default: output.file with a .jpg extension)`;

export async function run(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { at: { type: 'string' }, out: { type: 'string' } },
  });
  intro('still');
  const { dir, project, config } = await load(positionals[0]);
  const at = values.at ? parseAt(values.at) : firstDrop(project.events);
  const out = resolve(dir, values.out ?? config.output.file.replace(/(\.[^.]+)?$/, '.jpg'));
  await mkdir(dirname(out), { recursive: true });

  const spin = spinner();
  spin.start('Preparing browser');
  const result = await clearSpinnerOnError(spin, () =>
    still(project, {
      projectDir: dir,
      out,
      ...(at !== null && { at }),
      jpegQuality: config.output.jpegQuality,
      onProgress: ({ stage, progress }) => {
        const pct = Math.round(progress * 100);
        if (stage === 'browser')
          spin.message(
            progress < 1 ? `Downloading Chrome Headless Shell ${pct}%` : 'Browser ready',
          );
        if (stage === 'bundle') spin.message(`Bundling composition ${pct}%`);
      },
    }),
  );
  spin.stop(`Grabbed ${bold(formatTime(result.timeSeconds))} of the set`);
  outro(`${bold('Done')}  →  ${steel(relative(process.cwd(), result.file) || result.file)}`);
}

function parseAt(text: string): number {
  const at = parseTime(text);
  if (at === null || at < 0) {
    throw new SetcastError(
      `Invalid --at "${text}"`,
      'Use a timecode or seconds, e.g. --at 1:04 or --at 64.',
    );
  }
  return at;
}

/** The drop a set is best known by, or null to let the renderer pick a quarter of the way in. */
const firstDrop = (events: readonly SetEvent[]): number | null =>
  events.find((e) => e.type === 'drop' || e.type === 'double_drop')?.time ?? null;
