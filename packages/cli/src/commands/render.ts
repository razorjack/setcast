import { withRenderSession } from '@setcast/renderer-remotion';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import {
  chapterProblems,
  formatTime,
  hms,
  microseconds,
  parseTime,
  SetcastError,
  youtubeDescription,
  type ProjectConfig,
  type ResolvedProject,
} from '@setcast/core';
import { render, still, type RenderOptions, type StillOptions } from '@setcast/renderer-remotion';
import { parseCommandArgs, parseNumber, rangeWithinAudio } from '../args.ts';
import { stem } from '../paths.ts';
import { load, withSetEnvelope } from '../project.ts';
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

export const help = `setcast render [dir] [--range MM:SS-MM:SS] [--out file.mp4] [--theme name] [--concurrency N] [--bundle]

Renders the project in <dir> (default: current directory) to an MP4.
  --range        render only a slice, e.g. --range 1:00-1:30; its end clips to the set
  --out          output file; defaults to output.file in setcast.yaml
  --theme        a built-in theme or a .css file to use instead of setcast.yaml's theme:
  --concurrency  parallel browser tabs (default: Remotion's choice)
  --bundle       also write the thumbnail (.jpg) and the YouTube description (.txt) next to the MP4`;

interface RenderCommandOptions {
  dir: string | undefined;
  range: [number, number] | undefined;
  out: string | undefined;
  theme: string | undefined;
  concurrency: number | undefined;
  bundle: boolean;
}

export const run = (argv: string[]) => withRenderSession(() => runCommand(argv));

async function runCommand(argv: string[]): Promise<void> {
  let options = parseOptions(argv);

  intro('render');
  validateOptions(options);
  const loaded = await load(options.dir, options.theme);
  const { dir, config } = loaded;
  const duration = loaded.project.mix.duration / 1_000_000;
  if (options.range) {
    options = { ...options, range: rangeWithinAudio(options.range, duration, 'Render range') };
  }

  const out = outputPath(options, dir, config.output.file);
  await mkdir(dirname(out), { recursive: true });
  showProject(loaded.project, options.range);
  const project = await withSetEnvelope(loaded);

  const started = Date.now();
  const ui = new RenderUi();
  const job = renderOptions(options, {
    projectDir: dir,
    out,
    crf: config.output.crf,
    x264Preset: config.output.x264Preset,
    hardwareAcceleration: config.output.hardwareAcceleration,
    videoBitrate: config.output.videoBitrate,
    jpegQuality: config.output.jpegQuality,
    gl: config.output.gl,
    onProgress: ui.onProgress,
  });

  const result = await ui.run(() => render(project, job));
  const { size } = await stat(result.file);
  ui.doneEncoding(result.durationSeconds, size);

  const files = [result.file];
  if (options.bundle) {
    files.push(...(await sideOutputs(project, dir, out, config.output)));
  }

  const elapsed = formatDuration((Date.now() - started) / 1000);
  outro(`${bold('Done')} in ${elapsed}  →  ${files.map(shown).join(', ')}`);
}

function parseOptions(argv: string[]): RenderCommandOptions {
  const { values, positionals } = parseCommandArgs(
    argv,
    {
      range: { type: 'string' },
      out: { type: 'string' },
      theme: { type: 'string' },
      concurrency: { type: 'string' },
      bundle: { type: 'boolean' },
    },
    help,
  );
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
    theme: values.theme,
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
  const summary = [
    bold(project.title || 'Untitled set'),
    `${project.mix.recordings.length} recordings, ${project.mix.plays.length} plays, ${project.mix.listings.length} listings`,
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
  output: ProjectConfig['output'],
): Promise<string[]> {
  const base = stem(video);
  const thumbnail = await renderThumbnail(project, dir, `${base}.jpg`, output);
  const description = await writeDescription(project, `${base}.txt`);
  return [thumbnail, description];
}

async function renderThumbnail(
  project: ResolvedProject,
  dir: string,
  out: string,
  output: ProjectConfig['output'],
): Promise<string> {
  const ui = new RenderUi();
  const options: StillOptions = {
    projectDir: dir,
    out,
    at: firstDrop(project.mix.annotations),
    jpegQuality: output.jpegQuality,
    gl: output.gl,
    onProgress: ui.onProgress,
  };

  const thumbnail = await ui.run(() => still(project, options));
  ui.done(`Thumbnail from ${bold(formatTime(thumbnail.timeSeconds))}`);
  return thumbnail.file;
}

async function writeDescription(project: ResolvedProject, out: string): Promise<string> {
  await writeFile(out, youtubeDescription(project.title, project.mix));
  for (const problem of chapterProblems(project.mix)) warn(problem);
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
  const time = microseconds(seconds);
  const { h, m, s } = hms(time / 1_000_000);
  const fraction = String(time % 1_000_000)
    .padStart(6, '0')
    .replace(/0+$/, '');
  const suffix = fraction ? `.${fraction}` : '';
  if (h > 0) return `${h}h${pad(m)}m${pad(s)}${suffix}s`;
  return `${m}m${pad(s)}${suffix}s`;
};

const pad = (part: number) => String(part).padStart(2, '0');
