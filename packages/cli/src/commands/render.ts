import { mkdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { formatTime, hms, parseTime, SetcastError } from '@setcast/core';
import { render } from '@setcast/renderer-remotion';
import { load } from '../project.ts';
import { bold, dim, fmtSeconds, intro, log, outro, RenderUi, steel } from '../ui.ts';

export const help = `setcast render [dir] [--range MM:SS-MM:SS] [--out file.mp4] [--concurrency N]

Renders the project in <dir> (default: current directory) to an MP4.
  --range        render only a slice, e.g. --range 1:00-1:30 (handy for tuning)
  --out          output file; defaults to output.file in setcast.yaml
  --concurrency  parallel browser tabs (default: Remotion's choice)`;

export async function run(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      range: { type: 'string' },
      out: { type: 'string' },
      concurrency: { type: 'string' },
    },
  });
  intro('render');
  const { dir, project, config } = await load(positionals[0]);
  const range = values.range ? parseRange(values.range) : undefined;
  const concurrency = values.concurrency ? parseConcurrency(values.concurrency) : undefined;
  const out = resolve(
    dir,
    values.out ?? (range ? rangeName(config.output.file, range) : config.output.file),
  );
  await mkdir(dirname(out), { recursive: true });

  const tracks = project.events.filter((e) => e.type === 'track_start').length;
  log.info(
    `${bold(project.title || 'Untitled set')}  ${dim('·')}  ${tracks} tracks, ${project.events.length - tracks} events  ${dim('·')}  ${project.width}×${project.height} @ ${project.fps} fps  ${dim('·')}  theme ${steel(project.theme)}`,
  );
  if (range) log.info(`Range ${formatTime(range[0])} → ${formatTime(range[1])}`);

  const ui = new RenderUi();
  const started = Date.now();
  const result = await ui.run(() =>
    render(project, {
      projectDir: dir,
      out,
      ...(range && { range }),
      ...(concurrency && { concurrency }),
      crf: config.output.crf,
      jpegQuality: config.output.jpegQuality,
      onProgress: ui.onProgress,
    }),
  );
  ui.done(`Encoded ${fmtSeconds(result.durationSeconds)} of video`);
  outro(
    `${bold('Done')} in ${fmtSeconds((Date.now() - started) / 1000)}  →  ${steel(relative(process.cwd(), result.file) || result.file)}`,
  );
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

function parseConcurrency(text: string): number {
  const n = Number(text);
  if (!Number.isInteger(n) || n < 1) {
    throw new SetcastError(
      `Invalid --concurrency "${text}"`,
      'Use a whole number of parallel browser tabs, e.g. --concurrency 4.',
    );
  }
  return n;
}

export const rangeName = (file: string, [a, b]: [number, number]) =>
  file.replace(/(\.[^.]+)?$/, (ext) => `.${stamp(a)}-${stamp(b)}${ext}`);

/** `0m30s`, `1h02m03s`. Filename-safe, so no colons. */
const stamp = (seconds: number) => {
  const { h, m, s } = hms(seconds);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}h${String(m).padStart(2, '0')}m${ss}s` : `${m}m${ss}s`;
};
