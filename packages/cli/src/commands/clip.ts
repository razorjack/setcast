import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { formatTime, SetcastError, type SetEvent } from '@setcast/core';
import { render } from '@setcast/renderer-remotion';
import { parseAt, parseNumber } from '../args.ts';
import { load } from '../project.ts';
import { bold, dim, fmtSeconds, intro, log, outro, RenderUi, shown } from '../ui.ts';
import { rangeName } from './render.ts';

const DEFAULT_SECONDS = 45;
const MIN_SECONDS = 10;
const MAX_SECONDS = 120;

export const help = `setcast clip [dir] [--at MM:SS] [--seconds 45] [--all] [--out clip.mp4]

Cuts a promo clip around a drop, for socials. The drop lands a third of the way in.
  --at       the drop to cut around; defaults to the first drop
  --seconds  clip length, ${MIN_SECONDS} to ${MAX_SECONDS} (default ${DEFAULT_SECONDS})
  --all      one clip per drop
  --out      output file; defaults to output.file stamped with the clip's range`;

export async function run(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      at: { type: 'string' },
      seconds: { type: 'string' },
      all: { type: 'boolean' },
      out: { type: 'string' },
    },
  });
  if (values.all && (values.at || values.out)) {
    throw new SetcastError(
      '--all cuts every drop into its own file',
      'Drop --at and --out, or pick one drop with --at.',
    );
  }
  intro('clip');
  const { dir, project, config } = await load(positionals[0]);
  const seconds = values.seconds
    ? parseNumber('seconds', values.seconds, {
        min: MIN_SECONDS,
        max: MAX_SECONDS,
        hint: `Use a clip length from ${MIN_SECONDS} to ${MAX_SECONDS} seconds, e.g. --seconds 30.`,
      })
    : DEFAULT_SECONDS;
  const drops = project.events.filter(isDrop);
  const centres = values.at ? [parseAt(values.at)] : values.all ? drops.map((e) => e.time) : [];
  if (!values.at && !values.all) {
    if (!drops[0]) {
      throw new SetcastError(
        'No drop to cut around',
        'Add a drop event to setcast.yaml (or run `setcast analyze --write`), or pass --at.',
      );
    }
    centres.push(drops[0].time);
  }
  if (centres.length === 0) {
    outro('No drops in the set, so nothing to cut.');
    return;
  }

  const files: string[] = [];
  for (const at of centres) {
    const range = clipRange(at, seconds);
    const out = values.out
      ? resolve(values.out)
      : resolve(dir, rangeName(config.output.file, range));
    await mkdir(dirname(out), { recursive: true });
    log.info(
      `${bold(formatTime(at))} drop  ${dim('·')}  ${formatTime(range[0])} → ${formatTime(range[1])}`,
    );
    const ui = new RenderUi();
    const result = await ui.run(() =>
      render(project, {
        projectDir: dir,
        out,
        range,
        crf: config.output.crf,
        jpegQuality: config.output.jpegQuality,
        onProgress: ui.onProgress,
      }),
    );
    ui.done(`Encoded ${fmtSeconds(result.durationSeconds)} of video`);
    files.push(shown(result.file));
  }
  outro(`${bold('Done')}  →  ${files.join(', ')}`);
}

/** The clip's range: the drop a third of the way in, and never before the set starts. */
export function clipRange(at: number, seconds: number): [number, number] {
  const start = Math.max(0, at - seconds / 3);
  return [start, start + seconds];
}

const isDrop = (e: SetEvent) => e.type === 'drop' || e.type === 'double_drop';
