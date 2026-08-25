import { mkdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { formatTime, parseTime, SetcastError, type SetEvent } from '@setcast/core';
import { render } from '@setcast/renderer-remotion';
import { load } from '../project.ts';
import { bold, dim, fmtSeconds, intro, log, outro, RenderUi, steel } from '../ui.ts';
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
  const seconds = values.seconds ? parseSeconds(values.seconds) : DEFAULT_SECONDS;
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
    const out = resolve(dir, values.out ?? rangeName(config.output.file, range));
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
    files.push(steel(relative(process.cwd(), result.file) || result.file));
  }
  outro(`${bold('Done')}  →  ${files.join(', ')}`);
}

/** The clip's range: the drop a third of the way in, and never before the set starts. */
export function clipRange(at: number, seconds: number): [number, number] {
  const start = Math.max(0, at - seconds / 3);
  return [start, start + seconds];
}

function parseSeconds(text: string): number {
  const n = Number(text);
  if (!(n >= MIN_SECONDS && n <= MAX_SECONDS)) {
    throw new SetcastError(
      `Invalid --seconds "${text}"`,
      `Use a clip length from ${MIN_SECONDS} to ${MAX_SECONDS} seconds, e.g. --seconds 30.`,
    );
  }
  return n;
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

const isDrop = (e: SetEvent) => e.type === 'drop' || e.type === 'double_drop';
