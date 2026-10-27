import { parseRendererFlag, render, withRenderSession, type Renderer } from '../renderer.ts';
import { mkdir, stat } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import {
  exportSettings,
  toSeconds,
  formatTime,
  SetcastError,
  type Annotation,
} from '@setcast/core';
import type { LoadedProject } from '@setcast/core/node';
import {
  parseAt,
  parseCommandArgs,
  parseNumber,
  rangeWithinAudio,
  timeWithinAudio,
} from '../args.ts';
import { load, withHardwareEncoding, withWholeSet } from '../project.ts';
import { bold, dim, intro, log, outro, RenderUi, formatPath } from '../ui.ts';
import { rangeName, stem } from '../paths.ts';

const DEFAULT_SECONDS = 45;
const MIN_SECONDS = 10;
const MAX_SECONDS = 120;

export const help = `setcast clip [dir] [--at MM:SS] [--seconds 45] [--all] [--out clip.mp4] [--theme name]

Cuts a promo clip around a drop, for socials. The drop lands a third of the way in.
  --renderer  remotion (default) or browser (experimental); overrides renderer: in YAML
  --at       the drop to cut around; defaults to the first drop
  --seconds  clip length, ${MIN_SECONDS} to ${MAX_SECONDS}; clips at the set end (default ${DEFAULT_SECONDS})
  --all      one clip per drop
  --out      output file; defaults to output.file stamped with the clip's range
  --theme    a built-in theme or a .css file to use instead of setcast.yaml's theme:`;

interface ClipOptions {
  dir: string | undefined;
  center: number | undefined;
  seconds: number;
  all: boolean;
  out: string | undefined;
  theme: string | undefined;
  renderer: Renderer | undefined;
}

export async function run(argv: string[]) {
  const options = parseOptions(argv);
  intro('clip');

  const loaded = await load(options.dir, options.theme);
  await withRenderSession(
    () => runCommand(options, loaded),
    options.renderer ?? loaded.config.renderer,
  );
}

async function runCommand(options: ClipOptions, loaded: LoadedProject): Promise<void> {
  const duration = toSeconds(loaded.project.mix.duration);
  const centers = clipCenters(loaded.project.mix.annotations, options).map((center) =>
    timeWithinAudio(center, duration, '--at'),
  );
  if (centers.length === 0) {
    outro('No drops in the set, so nothing to cut.');
    return;
  }

  const checked = await withHardwareEncoding(loaded);
  const renderable = { ...checked, project: await withWholeSet(loaded) };
  const files: string[] = [];
  for (const center of centers) {
    files.push(await renderClip(renderable, center, duration, options));
  }
  outro(`${bold('Done')}  →  ${files.join(', ')}`);
}

function parseOptions(argv: string[]): ClipOptions {
  const { values, positionals } = parseCommandArgs(
    argv,
    {
      at: { type: 'string' },
      seconds: { type: 'string' },
      all: { type: 'boolean' },
      out: { type: 'string' },
      theme: { type: 'string' },
      renderer: { type: 'string' },
    },
    help,
  );
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
    theme: values.theme,
    renderer: parseRendererFlag(values.renderer),
  };
}

function clipCenters(events: Annotation[], options: ClipOptions): number[] {
  if (options.center !== undefined) return [options.center];

  const drops = events.filter(isDrop);
  if (options.all) return drops.map((event) => toSeconds(event.at));

  const firstDrop = drops[0];
  if (!firstDrop) {
    throw new SetcastError(
      'No drop to cut around',
      'Add a mix-scoped drop annotation to setcast.yaml (or run `setcast analyze --write`), or pass --at.',
    );
  }
  return [toSeconds(firstDrop.at)];
}

async function renderClip(
  loaded: LoadedProject,
  center: number,
  duration: number,
  options: ClipOptions,
): Promise<string> {
  const range = rangeWithinAudio(clipRange(center, options.seconds), duration, 'Clip range');
  const out = options.out
    ? resolve(options.out)
    : resolve(
        loaded.dir,
        clipFile(loaded.config.output.file, range, options.all ? center : undefined),
      );
  await mkdir(dirname(out), { recursive: true });

  const span = `${formatTime(range[0])} → ${formatTime(range[1])}`;
  log.info(`${bold(formatTime(center))} drop  ${dim('·')}  ${span}`);

  const ui = new RenderUi();
  const result = await ui.run(() =>
    render(loaded.project, {
      ...exportSettings(loaded.config.output),
      projectDir: loaded.dir,
      out,
      range,
      onProgress: ui.onProgress,
    }),
  );
  const { size } = await stat(result.file);
  ui.doneEncoding(result.durationSeconds, size);
  return formatPath(result.file);
}

/** A drop suffix keeps early drops distinct even when both clips clamp to the same range. */
export function clipFile(file: string, range: [number, number], center?: number): string {
  const named = center === undefined ? file : `${stem(file)}.drop-${center}s${extname(file)}`;
  return rangeName(named, range);
}

/** The clip's range: the drop a third of the way in, and never before the set starts. */
export function clipRange(at: number, seconds: number): [number, number] {
  const start = Math.max(0, at - seconds / 3);
  return [start, start + seconds];
}

const isDrop = (event: Annotation) => event.kind === 'drop' && event.scope === 'mix';
