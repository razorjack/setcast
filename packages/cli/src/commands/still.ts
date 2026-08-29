import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { formatTime, type SetEvent } from '@setcast/core';
import { still, type StillOptions } from '@setcast/renderer-remotion';
import { parseAt } from '../args.ts';
import { stem } from '../paths.ts';
import { load } from '../project.ts';
import { bold, intro, outro, RenderUi, shown } from '../ui.ts';

export const help = `setcast still [dir] [--at MM:SS] [--out thumb.jpg]

Renders one frame as an image, ready to upload as the YouTube thumbnail.
  --at   the moment to grab; defaults to the first drop, or a quarter into the set
  --out  output file; .png, .jpg or .webp (default: output.file with a .jpg extension)`;

interface StillCommandOptions {
  dir: string | undefined;
  at: number | undefined;
  out: string | undefined;
}

export async function run(argv: string[]): Promise<void> {
  const options = parseOptions(argv);

  intro('still');
  const { dir, project, config } = await load(options.dir);
  const out = options.out ? resolve(options.out) : defaultOut(dir, config.output.file);
  await mkdir(dirname(out), { recursive: true });

  const ui = new RenderUi();
  const grab: StillOptions = {
    projectDir: dir,
    out,
    at: options.at ?? firstDrop(project.events),
    jpegQuality: config.output.jpegQuality,
    onProgress: ui.onProgress,
  };

  const result = await ui.run(() => still(project, grab));
  ui.done(`Grabbed ${bold(formatTime(result.timeSeconds))} of the set`);

  outro(`${bold('Done')}  →  ${shown(result.file)}`);
}

function parseOptions(argv: string[]): StillCommandOptions {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { at: { type: 'string' }, out: { type: 'string' } },
  });
  return {
    dir: positionals[0],
    at: values.at ? parseAt(values.at) : undefined,
    out: values.out,
  };
}

/** The video's own name with an image extension, so the thumbnail sits next to the render. */
const defaultOut = (dir: string, videoFile: string) => resolve(dir, `${stem(videoFile)}.jpg`);

/** The drop a set is best known by. Undefined lets the renderer pick a quarter of the way in. */
export const firstDrop = (events: readonly SetEvent[]): number | undefined =>
  events.find((event) => event.type === 'drop' || event.type === 'double_drop')?.time;
