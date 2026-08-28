import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { formatTime, type SetEvent } from '@setcast/core';
import { still } from '@setcast/renderer-remotion';
import { parseAt } from '../args.ts';
import { stem } from '../paths.ts';
import { load } from '../project.ts';
import { bold, intro, outro, RenderUi, shown } from '../ui.ts';

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
  const out = values.out ? resolve(values.out) : resolve(dir, `${stem(config.output.file)}.jpg`);
  await mkdir(dirname(out), { recursive: true });

  const ui = new RenderUi();
  const result = await ui.run(() =>
    still(project, {
      projectDir: dir,
      out,
      ...(at !== null && { at }),
      jpegQuality: config.output.jpegQuality,
      onProgress: ui.onProgress,
    }),
  );
  ui.done(`Grabbed ${bold(formatTime(result.timeSeconds))} of the set`);
  outro(`${bold('Done')}  →  ${shown(result.file)}`);
}

/** The drop a set is best known by, or null to let the renderer pick a quarter of the way in. */
export const firstDrop = (events: readonly SetEvent[]): number | null =>
  events.find((e) => e.type === 'drop' || e.type === 'double_drop')?.time ?? null;
