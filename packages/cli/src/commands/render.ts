import { mkdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { formatTime, parseTime, SetcastError } from '@setcast/core';
import { render } from '@setcast/renderer-remotion';
import { load } from '../project.ts';
import { bold, dim, fmtSeconds, intro, log, outro, ProgressLine, spinner, steel } from '../ui.ts';

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

  const prep = spinner();
  prep.start('Preparing browser');
  let frames: ProgressLine | undefined;
  let encode: ProgressLine | undefined;
  const started = Date.now();

  const result = await render(project, {
    projectDir: dir,
    out,
    ...(range && { range }),
    ...(values.concurrency && { concurrency: Number(values.concurrency) }),
    onProgress: ({ stage, progress, renderedFrames = 0, totalFrames = 0 }) => {
      if (stage === 'browser')
        prep.message(
          progress < 1
            ? `Downloading Chrome Headless Shell ${Math.round(progress * 100)}%`
            : 'Browser ready',
        );
      if (stage === 'bundle') prep.message(`Bundling composition ${Math.round(progress * 100)}%`);
      if (stage === 'frames') {
        if (!frames) {
          prep.stop('Composition bundled');
          frames = new ProgressLine('frames');
        }
        frames.update(progress, `${renderedFrames}/${totalFrames}`);
      }
      if (stage === 'encode') {
        frames?.update(1, `${totalFrames}/${totalFrames}`);
        if (!encode) {
          frames?.done(`Rendered ${totalFrames} frames`);
          encode = new ProgressLine('encode');
        }
        encode.update(progress, 'h264 + aac');
      }
    },
  });
  encode?.done(`Encoded ${fmtSeconds(result.durationSeconds)} of video`);
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

const rangeName = (file: string, [a, b]: [number, number]) =>
  file.replace(/(\.[^.]+)?$/, (ext) => `.${stamp(a)}-${stamp(b)}${ext}`);
const stamp = (s: number) => formatTime(s).replace(':', 'm') + 's';
