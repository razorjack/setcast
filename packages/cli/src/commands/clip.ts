import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { formatTime, SetcastError, type SetEvent } from '@setcast/core';
import type { LoadedProject } from '@setcast/core/node';
import { render } from '@setcast/renderer-remotion';
import { parseAt, parseNumber } from '../args.ts';
import { load } from '../project.ts';
import { bold, dim, formatDuration, intro, log, outro, RenderUi, shown } from '../ui.ts';
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

interface ClipOptions {
  dir: string | undefined;
  center: number | undefined;
  seconds: number;
  all: boolean;
  out: string | undefined;
}

export async function run(argv: string[]): Promise<void> {
  const options = parseOptions(argv);

  intro('clip');
  const loaded = await load(options.dir);
  const centers = clipCenters(loaded.project.events, options);
  if (centers.length === 0) {
    outro('No drops in the set, so nothing to cut.');
    return;
  }

  const files: string[] = [];
  for (const center of centers) {
    files.push(await renderClip(loaded, center, options));
  }
  outro(`${bold('Done')}  →  ${files.join(', ')}`);
}

function parseOptions(argv: string[]): ClipOptions {
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
  const seconds = values.seconds
    ? parseNumber('seconds', values.seconds, {
        min: MIN_SECONDS,
        max: MAX_SECONDS,
        hint: `Use a clip length from ${MIN_SECONDS} to ${MAX_SECONDS} seconds, e.g. --seconds 30.`,
      })
    : DEFAULT_SECONDS;
  return {
    dir: positionals[0],
    center: values.at ? parseAt(values.at) : undefined,
    seconds,
    all: values.all ?? false,
    out: values.out,
  };
}

function clipCenters(events: SetEvent[], options: ClipOptions): number[] {
  if (options.center !== undefined) return [options.center];

  const drops = events.filter(isDrop);
  if (options.all) return drops.map((event) => event.time);

  const firstDrop = drops[0];
  if (!firstDrop) {
    throw new SetcastError(
      'No drop to cut around',
      'Add a drop event to setcast.yaml (or run `setcast analyze --write`), or pass --at.',
    );
  }
  return [firstDrop.time];
}

async function renderClip(
  loaded: LoadedProject,
  center: number,
  options: ClipOptions,
): Promise<string> {
  const range = clipRange(center, options.seconds);
  const out = clipPath(loaded, range, options.out);
  await mkdir(dirname(out), { recursive: true });

  const span = `${formatTime(range[0])} → ${formatTime(range[1])}`;
  log.info(`${bold(formatTime(center))} drop  ${dim('·')}  ${span}`);

  const ui = new RenderUi();
  const result = await ui.run(() =>
    render(loaded.project, {
      projectDir: loaded.dir,
      out,
      range,
      crf: loaded.config.output.crf,
      jpegQuality: loaded.config.output.jpegQuality,
      onProgress: ui.onProgress,
    }),
  );
  ui.done(`Encoded ${formatDuration(result.durationSeconds)} of video`);
  return shown(result.file);
}

const clipPath = (loaded: LoadedProject, range: [number, number], out: string | undefined) =>
  out ? resolve(out) : resolve(loaded.dir, rangeName(loaded.config.output.file, range));

/** The clip's range: the drop a third of the way in, and never before the set starts. */
export function clipRange(at: number, seconds: number): [number, number] {
  const start = Math.max(0, at - seconds / 3);
  return [start, start + seconds];
}

const isDrop = (event: SetEvent) => event.type === 'drop' || event.type === 'double_drop';
