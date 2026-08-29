import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  chapterProblems,
  formatTime,
  hms,
  parseTime,
  SetcastError,
  youtubeDescription,
  type ResolvedProject,
} from '@setcast/core';
import { render, still, type RenderOptions, type StillOptions } from '@setcast/renderer-remotion';
import { parseNumber } from '../args.ts';
import { stem } from '../paths.ts';
import { load } from '../project.ts';
import {
  bold,
  dim,
  formatDuration,
  intro,
  log,
  outro,
  RenderUi,
  shown,
  steel,
  warn,
} from '../ui.ts';
import { firstDrop } from './still.ts';

export const help = `setcast render [dir] [--range MM:SS-MM:SS] [--out file.mp4] [--concurrency N] [--bundle]

Renders the project in <dir> (default: current directory) to an MP4.
  --range        render only a slice, e.g. --range 1:00-1:30 (handy for tuning)
  --out          output file; defaults to output.file in setcast.yaml
  --concurrency  parallel browser tabs (default: Remotion's choice)
  --bundle       also write the thumbnail (.jpg) and the YouTube description (.txt) next to the MP4`;

interface RenderCommandOptions {
  dir: string | undefined;
  range: [number, number] | undefined;
  out: string | undefined;
  concurrency: number | undefined;
  bundle: boolean;
}

export async function run(argv: string[]): Promise<void> {
  const options = parseOptions(argv);

  intro('render');
  const { dir, project, config } = await load(options.dir);
  validateOptions(options);

  const out = outputPath(options, dir, config.output.file);
  await mkdir(dirname(out), { recursive: true });
  showProject(project, options.range);

  const started = Date.now();
  const ui = new RenderUi();
  const job = renderOptions(options, {
    projectDir: dir,
    out,
    crf: config.output.crf,
    jpegQuality: config.output.jpegQuality,
    onProgress: ui.onProgress,
  });

  const result = await ui.run(() => render(project, job));
  ui.done(`Encoded ${formatDuration(result.durationSeconds)} of video`);

  const files = [result.file];
  if (options.bundle) {
    files.push(...(await sideOutputs(project, dir, out, config.output.jpegQuality)));
  }

  const elapsed = formatDuration((Date.now() - started) / 1000);
  outro(`${bold('Done')} in ${elapsed}  →  ${files.map(shown).join(', ')}`);
}

function parseOptions(argv: string[]): RenderCommandOptions {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      range: { type: 'string' },
      out: { type: 'string' },
      concurrency: { type: 'string' },
      bundle: { type: 'boolean' },
    },
  });
  const range = values.range ? parseRange(values.range) : undefined;
  const concurrency = values.concurrency
    ? parseNumber('concurrency', values.concurrency, {
        min: 1,
        integer: true,
        hint: 'Use a whole number of parallel browser tabs, e.g. --concurrency 4.',
      })
    : undefined;
  return {
    dir: positionals[0],
    range,
    out: values.out,
    concurrency,
    bundle: values.bundle ?? false,
  };
}

function validateOptions(options: RenderCommandOptions): void {
  if (options.bundle && options.range) {
    throw new SetcastError(
      '--bundle renders the whole set',
      'Drop --range, or render the slice on its own and run `setcast still` and `setcast chapters` for the rest.',
    );
  }
}

function outputPath(options: RenderCommandOptions, dir: string, configuredFile: string): string {
  if (options.out) return resolve(options.out);

  const file = options.range ? rangeName(configuredFile, options.range) : configuredFile;
  return resolve(dir, file);
}

function showProject(project: ResolvedProject, range: [number, number] | undefined): void {
  const tracks = project.events.filter((event) => event.type === 'track_start').length;
  const summary = [
    bold(project.title || 'Untitled set'),
    `${tracks} tracks, ${project.events.length - tracks} events`,
    `${project.width}×${project.height} @ ${project.fps} fps`,
    `theme ${steel(project.theme)}`,
  ];
  log.info(summary.join(`  ${dim('·')}  `));
  if (range) log.info(`Range ${formatTime(range[0])} → ${formatTime(range[1])}`);
}

/** The command's flags layered over what the project's `output:` block already settled. */
function renderOptions(command: RenderCommandOptions, base: RenderOptions): RenderOptions {
  const options = { ...base };
  if (command.range) options.range = command.range;
  if (command.concurrency) options.concurrency = command.concurrency;
  return options;
}

/** The thumbnail and the description, so one command leaves everything the upload form asks for. */
async function sideOutputs(
  project: ResolvedProject,
  dir: string,
  video: string,
  jpegQuality: number,
): Promise<string[]> {
  const base = stem(video);
  const thumbnail = await renderThumbnail(project, dir, `${base}.jpg`, jpegQuality);
  const description = await writeDescription(project, `${base}.txt`);
  return [thumbnail, description];
}

async function renderThumbnail(
  project: ResolvedProject,
  dir: string,
  out: string,
  jpegQuality: number,
): Promise<string> {
  const ui = new RenderUi();
  const options: StillOptions = {
    projectDir: dir,
    out,
    at: firstDrop(project.events),
    jpegQuality,
    onProgress: ui.onProgress,
  };

  const thumbnail = await ui.run(() => still(project, options));
  ui.done(`Thumbnail from ${bold(formatTime(thumbnail.timeSeconds))}`);
  return thumbnail.file;
}

async function writeDescription(project: ResolvedProject, out: string): Promise<string> {
  await writeFile(out, youtubeDescription(project.title, project.events));
  for (const problem of chapterProblems(project.events)) warn(problem);
  return out;
}

export function parseRange(text: string): [number, number] {
  const range = splitRange(text.trim());
  if (range) return range;
  throw new SetcastError(
    `Invalid --range "${text}"`,
    'Use START-END with timecodes or seconds, e.g. --range 1:00-1:30 or --range 60-90. END must be after START.',
  );
}

function splitRange(text: string): [number, number] | null {
  const match = /^([^-]+)-([^-]+)$/.exec(text);
  if (!match) return null;
  const start = parseTime(match[1]!.trim());
  const end = parseTime(match[2]!.trim());
  if (start === null || end === null || end <= start) return null;
  return [start, end];
}

export const rangeName = (file: string, [start, end]: [number, number]) =>
  `${stem(file)}.${stamp(start)}-${stamp(end)}${extname(file)}`;

/** `0m30s`, `1h02m03s`. Filename-safe, so no colons. */
const stamp = (seconds: number) => {
  const { h, m, s } = hms(seconds);
  if (h > 0) return `${h}h${pad(m)}m${pad(s)}s`;
  return `${m}m${pad(s)}s`;
};

const pad = (part: number) => String(part).padStart(2, '0');
