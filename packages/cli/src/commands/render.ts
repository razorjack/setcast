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
import { bold, dim, fmtSeconds, intro, log, outro, RenderUi, shown, steel, warn } from '../ui.ts';
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

interface RenderInputs {
  projectDir: string;
  out: string;
  crf: number;
  jpegQuality: number;
  ui: RenderUi;
}

export async function run(argv: string[]): Promise<void> {
  const options = parseOptions(argv);

  intro('render');
  const { dir, project, config } = await load(options.dir);
  validateOptions(options);

  const out = outputPath(options, dir, config.output.file);
  await mkdir(dirname(out), { recursive: true });
  showProject(project, options.range);

  const ui = new RenderUi();
  const started = Date.now();
  const result = await ui.run(() =>
    render(
      project,
      renderOptions(options, {
        projectDir: dir,
        out,
        crf: config.output.crf,
        jpegQuality: config.output.jpegQuality,
        ui,
      }),
    ),
  );
  ui.done(`Encoded ${fmtSeconds(result.durationSeconds)} of video`);

  const files = [result.file];
  if (options.bundle) {
    files.push(...(await sideOutputs(project, dir, out, config.output.jpegQuality)));
  }
  outro(
    `${bold('Done')} in ${fmtSeconds((Date.now() - started) / 1000)}  →  ${files.map(shown).join(', ')}`,
  );
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
  log.info(
    `${bold(project.title || 'Untitled set')}  ${dim('·')}  ${tracks} tracks, ${project.events.length - tracks} events  ${dim('·')}  ${project.width}×${project.height} @ ${project.fps} fps  ${dim('·')}  theme ${steel(project.theme)}`,
  );
  if (range) log.info(`Range ${formatTime(range[0])} → ${formatTime(range[1])}`);
}

function renderOptions(command: RenderCommandOptions, inputs: RenderInputs): RenderOptions {
  const options: RenderOptions = {
    projectDir: inputs.projectDir,
    out: inputs.out,
    crf: inputs.crf,
    jpegQuality: inputs.jpegQuality,
    onProgress: inputs.ui.onProgress,
  };
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
  const at = firstDrop(project.events);
  const ui = new RenderUi();
  const options: StillOptions = {
    projectDir: dir,
    out: `${base}.jpg`,
    jpegQuality,
    onProgress: ui.onProgress,
  };
  if (at !== null) options.at = at;

  const thumb = await ui.run(() => still(project, options));
  ui.done(`Thumbnail from ${bold(formatTime(thumb.timeSeconds))}`);
  const text = `${base}.txt`;
  await writeFile(text, youtubeDescription(project.title, project.events));
  for (const problem of chapterProblems(project.events)) warn(problem);
  return [thumb.file, text];
}

export function parseRange(text: string): [number, number] {
  const m = /^([^-]+)-([^-]+)$/.exec(text.trim());
  const start = m && parseTime(m[1]!.trim());
  const end = m && parseTime(m[2]!.trim());
  if (start === null || end === null || !m || end <= start) {
    throw new SetcastError(
      `Invalid --range "${text}"`,
      'Use START-END with timecodes or seconds, e.g. --range 1:00-1:30 or --range 60-90. END must be after START.',
    );
  }
  return [start, end];
}

export const rangeName = (file: string, [a, b]: [number, number]) =>
  `${stem(file)}.${stamp(a)}-${stamp(b)}${extname(file)}`;

/** `0m30s`, `1h02m03s`. Filename-safe, so no colons. */
const stamp = (seconds: number) => {
  const { h, m, s } = hms(seconds);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}m${ss}s` : `${m}m${ss}s`;
};
