import { relative } from 'node:path';
import * as p from '@clack/prompts';
import { ConfigError, hms, SetcastError } from '@setcast/core';
import type { RenderProgress } from '@setcast/renderer-remotion';
import pc from 'picocolors';

const rgb = (r: number, g: number, b: number) => (text: string) =>
  pc.isColorSupported ? `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m` : text;
export const accent = rgb(255, 106, 43);
export const steel = rgb(127, 212, 230);
export const dim = pc.dim;
export const bold = pc.bold;

export const intro = (command: string) =>
  p.intro(`${pc.bgBlack(pc.bold(accent(' setcast ')))} ${dim(command)}`);
export const outro = p.outro;
export const note = p.note;
export const log = p.log;
export const cancel = p.cancel;
export const spinner = p.spinner;
export const isCancel = p.isCancel;
export const prompts = p;

export async function clearSpinnerOnError<T>(
  spin: { clear(): void },
  task: () => Promise<T>,
): Promise<T> {
  try {
    return await task();
  } catch (error) {
    spin.clear();
    throw error;
  }
}

/** A file as the outro names it: relative to the working directory when it is inside. */
export const shown = (file: string) => steel(relative(process.cwd(), file) || file);

/** A warning that must not end up in a piped stdout. */
export const warn = (message: string) => process.stderr.write(`${pc.yellow('!')} ${message}\n`);

export function printError(error: unknown): void {
  if (error instanceof ConfigError) {
    p.log.error(pc.red(error.message));
    for (const issue of error.issues) {
      p.log.message(`${accent(issue.path || '(root)')}  ${issue.message}`, { symbol: pc.red('│') });
    }
    p.log.message(dim(error.hint ?? ''));
    return;
  }
  if (error instanceof SetcastError) {
    p.log.error(pc.red(error.message));
    if (error.hint) p.log.message(dim(error.hint));
    return;
  }
  const unexpected = error as Error | undefined;
  p.log.error(pc.red(unexpected?.message ?? String(error)));
  if (unexpected?.stack) p.log.message(dim(topOfStack(unexpected.stack)));
}

/** Enough frames to place the failure, without burying the message under the whole stack. */
const topOfStack = (stack: string) => stack.split('\n').slice(1, 6).join('\n');

/** Human durations: `45s`, `2m 05s`, `1h 01m 40s`. */
export function formatDuration(seconds: number): string {
  const { h, m, s } = hms(Math.round(seconds));
  if (h > 0) return `${h}h ${pad(m)}m ${pad(s)}s`;
  if (m > 0) return `${m}m ${pad(s)}s`;
  return `${s}s`;
}

const pad = (part: number) => String(part).padStart(2, '0');

/** A single in-place progress line: `▰▰▰▱▱ 62%  frames 812/1320  eta 14s`. */
export class ProgressLine {
  #start = Date.now();
  #last = '';
  #tick = -1;
  #label: string;
  readonly #width = 24;

  constructor(label: string) {
    this.#label = label;
    process.stdout.write('\n');
  }

  update(progress: number, detail = ''): void {
    if (this.#tooSoon(progress)) return;
    this.#tick = Math.floor(progress * 10);

    const percent = `${String(Math.round(progress * 100)).padStart(3)}%`;
    const line = `${dim('│')}  ${bold(this.#label.padEnd(8))} ${this.#bar(progress)} ${percent}  ${dim(detail)}${dim(this.#eta(progress))}`;
    if (line === this.#last) return;

    process.stdout.write(process.stdout.isTTY ? `\r\x1b[2K${line}` : `${line}\n`);
    this.#last = line;
  }

  /** Without a TTY there is no redraw in place, so a log gets one line per tenth instead. */
  #tooSoon(progress: number): boolean {
    if (process.stdout.isTTY || progress >= 1) return false;
    return Math.floor(progress * 10) === this.#tick;
  }

  #bar(progress: number): string {
    const filled = Math.round(progress * this.#width);
    return accent('▰'.repeat(filled)) + dim('▱'.repeat(this.#width - filled));
  }

  /** Nothing until there is enough progress to extrapolate from, and nothing once it is done. */
  #eta(progress: number): string {
    if (progress <= 0.02 || progress >= 1) return '';
    const elapsed = (Date.now() - this.#start) / 1000;
    return `  eta ${formatDuration((elapsed / progress) * (1 - progress))}`;
  }

  done(message: string): void {
    process.stdout.write(
      `${process.stdout.isTTY ? '\r\x1b[2K' : ''}${pc.green('◇')}  ${message}\n`,
    );
  }
}

/**
 * Terminal output for a render or a still: a spinner while the browser and bundle come up, then
 * one progress line per stage. Feed it `onProgress`; finish with `done`.
 */
export class RenderUi {
  readonly #spin = spinner();
  #frames: ProgressLine | undefined;
  #encode: ProgressLine | undefined;

  constructor() {
    this.#spin.start('Preparing browser');
  }

  readonly onProgress = ({
    stage,
    progress,
    renderedFrames = 0,
    totalFrames = 0,
  }: RenderProgress): void => {
    const percent = Math.round(progress * 100);
    if (stage === 'browser') {
      const message =
        progress < 1 ? `Downloading Chrome Headless Shell ${percent}%` : 'Browser ready';
      this.#spin.message(message);
      return;
    }
    if (stage === 'bundle') {
      this.#spin.message(`Bundling composition ${percent}%`);
      return;
    }
    if (stage === 'frames') {
      this.#framesLine().update(progress, `${renderedFrames}/${totalFrames}`);
      return;
    }
    this.#encodeLine(totalFrames).update(progress, 'h264 + aac');
  };

  /** The first frame report is what tells us the bundle is done, so the spinner stops here. */
  #framesLine(): ProgressLine {
    if (!this.#frames) {
      this.#spin.stop('Composition bundled');
      this.#frames = new ProgressLine('frames');
    }
    return this.#frames;
  }

  /** Encoding starts once every frame is rendered, so the frames line is closed off first. */
  #encodeLine(totalFrames: number): ProgressLine {
    this.#frames?.update(1, `${totalFrames}/${totalFrames}`);
    if (!this.#encode) {
      this.#frames?.done(`Rendered ${totalFrames} frames`);
      this.#encode = new ProgressLine('encode');
    }
    return this.#encode;
  }

  /** Runs `task`; a failure while the spinner is up clears it so the error prints cleanly. */
  run<T>(task: () => Promise<T>): Promise<T> {
    const clear = () => {
      if (!this.#frames) this.#spin.clear();
    };
    return clearSpinnerOnError({ clear }, task);
  }

  done(message: string): void {
    if (this.#encode) this.#encode.done(message);
    else this.#spin.stop(message);
  }
}
