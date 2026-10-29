import type { RenderOptions, StillOptions } from '@setcast/core';
import { parseRendererFlag, render, still, withRenderSession, type Renderer } from '../renderer.ts';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  exportSettings,
  toSeconds,
  chapterProblems,
  formatTime,
  formatDuration,
  parseTime,
  SetcastError,
  youtubeDescription,
  type ProjectConfig,
  type ResolvedProject,
} from '@setcast/core';
import { parseCommandArgs, parseNumber, rangeWithinAudio } from '../args.ts';
import type { LoadedProject } from '@setcast/core/node';
import { rangeName, stem } from '../paths.ts';
import { load, withHardwareEncoding, withWholeSet } from '../project.ts';
import { bold, dim, intro, log, outro, RenderUi, formatPath, steel, warn } from '../ui.ts';

export const help = `setcast render [dir] [--range MM:SS-MM:SS] [--out file.mp4] [--theme name] [--concurrency N] [--bundle]

Renders the project in <dir> (default: current directory) to an MP4.
  --renderer  remotion (default) or browser (experimental); overrides renderer: in YAML
  --range        render only a slice, e.g. --range 1:00-1:30; its end clips to the set
  --out          output file; defaults to output.file in setcast.yaml
  --theme        a built-in theme or a .css file to use instead of setcast.yaml's theme:
  --concurrency  parallel browser tabs (default: Remotion chooses; browser uses 1)
  --resume       browser only: retain completed chunks and reuse valid checkpoints after interruption
  --cache        browser only: persistent chunk cache directory (separate from --resume)
  --cache-size   maximum cached video MiB (default: 2048); requires --cache
  --bundle       also write the thumbnail (.jpg) and the YouTube description (.txt) next to the MP4`;

interface RenderCommandOptions {
  dir: string | undefined;
  range: [number, number] | undefined;
  out: string | undefined;
  theme: string | undefined;
  renderer: Renderer | undefined;
  concurrency: number | undefined;
  bundle: boolean;
  resume: boolean;
  cache: RenderOptions['cache'];
}

export async function run(argv: string[]) {
  const options = parseOptions(argv);
  intro('render');
  validateOptions(options);
  const loaded = await load(options.dir, options.theme);
  const renderer = options.renderer ?? loaded.config.renderer;
  if (options.resume && renderer !== 'browser')
    throw new SetcastError(
      '--resume requires the browser renderer.',
      'Use --renderer browser --resume, or omit --resume for Remotion.',
    );
  if (options.cache && renderer !== 'browser')
    throw new SetcastError(
      '--cache requires the browser renderer.',
      'Use --renderer browser --cache <directory>, or omit --cache.',
    );
  await withRenderSession(() => runCommand(options, loaded), renderer);
}

async function runCommand(options: RenderCommandOptions, loaded: LoadedProject): Promise<void> {
  const { dir } = loaded;
  const range = renderedRange(options.range, loaded.project);
  const out = outputPath(options.out, range, resolve(dir, loaded.config.output.file));
  if (options.resume) log.info(`Resume checkpoints: ${out}.setcast-resume`);
  if (options.cache) log.info(`Persistent render cache: ${options.cache.directory}`);
  await mkdir(dirname(out), { recursive: true });
  showProject(loaded.project, range);
  const { config } = await withHardwareEncoding(loaded);
  const project = await withWholeSet(loaded);

  const started = Date.now();
  const ui = new RenderUi();
  const job: RenderOptions = {
    ...exportSettings(config.output),
    projectDir: dir,
    out,
    range,
    concurrency: options.concurrency,
    resume: options.resume,
    cache: options.cache,
    onProgress: ui.onProgress,
    onRuntime: ui.onRuntime,
  };

  const result = await ui.run(() => render(project, job));
  const { size } = await stat(result.file);
  ui.doneEncoding(result.durationSeconds, size);

  const files = [result.file];
  if (options.bundle) {
    files.push(...(await sideOutputs(project, dir, out, config.output)));
  }

  const elapsed = formatDuration((Date.now() - started) / 1000);
  outro(`${bold('Done')} in ${elapsed}  →  ${files.map(formatPath).join(', ')}`);
}

function parseOptions(argv: string[]): RenderCommandOptions {
  const { values, positionals } = parseCommandArgs(
    argv,
    {
      range: { type: 'string' },
      out: { type: 'string' },
      theme: { type: 'string' },
      renderer: { type: 'string' },
      concurrency: { type: 'string' },
      bundle: { type: 'boolean' },
      resume: { type: 'boolean' },
      cache: { type: 'string' },
      'cache-size': { type: 'string' },
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
    renderer: parseRendererFlag(values.renderer),
    concurrency,
    bundle: values.bundle ?? false,
    resume: values.resume ?? false,
    cache: parseCacheOptions(values.cache, values['cache-size']),
  };
}

function validateOptions(options: RenderCommandOptions): void {
  if (options.cache && options.resume)
    throw new SetcastError(
      '--cache and --resume cannot be combined.',
      'Use --cache for persistent chunk reuse, or --resume for output-specific interruption checkpoints.',
    );
  if (options.bundle && options.range) {
    throw new SetcastError(
      '--bundle renders the whole set',
      'Drop --range, or render the slice on its own and run `setcast still` and `setcast chapters` for the rest.',
    );
  }
}

export function parseCacheOptions(
  directory: string | undefined,
  size: string | undefined,
): RenderOptions['cache'] {
  if (directory === undefined) {
    if (size !== undefined)
      throw new SetcastError(
        '--cache-size requires --cache.',
        'Pass --cache <directory>, or omit --cache-size.',
      );
    return undefined;
  }
  if (!directory.trim())
    throw new SetcastError('Cache directory must not be empty.', 'Pass --cache <directory>.');
  const mib =
    size === undefined
      ? 2048
      : parseNumber('cache-size', size, {
          min: 1,
          integer: true,
          hint: 'Use a positive integer MiB value, e.g. --cache-size 2048.',
        });
  const maxBytes = mib * 1024 * 1024;
  if (!Number.isSafeInteger(maxBytes))
    throw new SetcastError(
      'Cache size exceeds safe byte accounting.',
      'Use a smaller integer MiB value.',
    );
  return { directory: resolve(directory), maxBytes };
}

/** The requested slice with its end clipped to the set, or the whole set when none was asked. */
function renderedRange(range: [number, number] | undefined, project: ResolvedProject) {
  if (!range) return undefined;
  return rangeWithinAudio(range, toSeconds(project.mix.duration), 'Render range');
}

function outputPath(out: string | undefined, range: [number, number] | undefined, file: string) {
  if (out) return resolve(out);
  if (range) return rangeName(file, range);
  return file;
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
