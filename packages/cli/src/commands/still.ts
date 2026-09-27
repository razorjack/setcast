import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { formatTime, type SetEvent } from '@setcast/core';
import { probeAudio, still, type StillOptions } from '@setcast/renderer-remotion';
import { parseAt, parseCommandArgs, timeWithinAudio } from '../args.ts';
import { stem } from '../paths.ts';
import { load, warnEventsAfterAudio, withSetEnvelope } from '../project.ts';
import { bold, intro, outro, RenderUi, shown } from '../ui.ts';

export const help = `setcast still [dir] [--at MM:SS] [--out thumb.jpg] [--theme name]

Renders one frame as an image, ready to upload as the YouTube thumbnail.
  --at     the moment to grab; defaults to the first drop, or a quarter into the set
  --out    output file; .png, .jpg or .webp (default: output.file with a .jpg extension)
  --theme  a built-in theme or a .css file to use instead of setcast.yaml's theme:`;

interface StillCommandOptions {
  dir: string | undefined;
  at: number | undefined;
  out: string | undefined;
  theme: string | undefined;
}

export async function run(argv: string[]): Promise<void> {
  const options = parseOptions(argv);

  intro('still');
  const loaded = await load(options.dir, options.theme);
  const { dir, config } = loaded;
  const duration = await probeAudio(loaded.project, dir);
  warnEventsAfterAudio(loaded.project.events, duration);
  const at = timeWithinAudio(
    options.at ?? firstDrop(loaded.project.events) ?? duration / 4,
    duration,
    '--at',
  );
  const out = options.out ? resolve(options.out) : defaultOut(dir, config.output.file);
  await mkdir(dirname(out), { recursive: true });
  const project = await withSetEnvelope(loaded);

  const ui = new RenderUi();
  const grab: StillOptions = {
    projectDir: dir,
    out,
    at,
    jpegQuality: config.output.jpegQuality,
    onProgress: ui.onProgress,
  };

  const result = await ui.run(() => still(project, grab));
  ui.done(`Grabbed ${bold(formatTime(result.timeSeconds))} of the set`);

  outro(`${bold('Done')}  →  ${shown(result.file)}`);
}

function parseOptions(argv: string[]): StillCommandOptions {
  const { values, positionals } = parseCommandArgs(
    argv,
    { at: { type: 'string' }, out: { type: 'string' }, theme: { type: 'string' } },
    help,
  );
  return {
    dir: positionals[0],
    at: values.at ? parseAt(values.at) : undefined,
    out: values.out,
    theme: values.theme,
  };
}

/** The video's own name with an image extension, so the thumbnail sits next to the render. */
const defaultOut = (dir: string, videoFile: string) => resolve(dir, `${stem(videoFile)}.jpg`);

/** The drop a set is best known by. Undefined lets the renderer pick a quarter of the way in. */
export const firstDrop = (events: readonly SetEvent[]): number | undefined =>
  events.find((event) => event.type === 'drop' || event.type === 'double_drop')?.time;
