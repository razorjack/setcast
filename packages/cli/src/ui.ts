import { homedir } from 'node:os';
import { isAbsolute, join, relative, sep } from 'node:path';
import * as p from '@clack/prompts';
import { clamp, ConfigError, hms, SetcastError } from '@setcast/core';
import type { RenderProgress } from '@setcast/renderer-remotion';
import pc from 'picocolors';
import { clearTabProgress, linkToFile, showTabBusy, showTabProgress } from './terminal.ts';

const rgb = (r: number, g: number, b: number) => (text: string) =>
  pc.isColorSupported ? `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m` : text;
export const accent = rgb(255, 106, 43);
export const steel = rgb(127, 212, 230);
export const dim = pc.dim;
export const bold = pc.bold;

/** A command's `--help` styled like the top-level usage: the command in bold, flags in steel. */
export function formatHelp(help: string): string {
  const [usage = '', ...body] = help.split('\n');
  const styledUsage = usage.replace(
    /^setcast (\S+)/,
    (_, command: string) => `${bold(accent('setcast'))} ${bold(command)}`,
  );
  const styledBody = body.map((line) =>
    line.replace(/^ {2}(--[\w-]+)/, (_, flag: string) => `  ${steel(flag)}`),
  );
  return [styledUsage, ...styledBody].join('\n');
}

/**
 * A YAML draft for the terminal: keys and list dashes dimmed so the values stand out, and event
 * types in the colors of the event list. Copying from the terminal leaves the colors behind.
 */
export const highlightYaml = (yaml: string) =>
  process.stdout.isTTY ? yaml.split('\n').map(highlightYamlLine).join('\n') : yaml;

/** `  - kind: drop` or `    at: 0:33.1`: the indent, the dimmed label, the value. */
const YAML_ENTRY = /^( *)((?:- )?(\w+):)(.*)$/;

function highlightYamlLine(line: string): string {
  const entry = YAML_ENTRY.exec(line);
  if (!entry) return line;

  const [, indent = '', label = '', key, value = ''] = entry;
  if (key !== 'kind') return `${indent}${dim(label)}${value}`;
  return `${indent}${dim(label)}${eventColor(value.trim())(value)}`;
}

const eventColor = (type: string) => (type === 'drop' ? accent : steel);

/** Whether `intro` has drawn the rail that warnings continue. `chapters` draws none. */
let railStarted = false;

export const intro = (command: string) => {
  railStarted = true;
  p.intro(`${pc.bgBlack(pc.bold(accent(' setcast ')))} ${dim(command)}`, {
    output: process.stderr,
  });
};
export const outro: typeof p.outro = (message, options) =>
  p.outro(message, { ...options, output: process.stderr });
export const note: typeof p.note = (message, title, options) =>
  p.note(message, title, { ...options, output: process.stderr });
export const log: typeof p.log = {
  message: (message, options) => p.log.message(message, { ...options, output: process.stderr }),
  info: (message, options) => p.log.info(message, { ...options, output: process.stderr }),
  success: (message, options) => p.log.success(message, { ...options, output: process.stderr }),
  step: (message, options) => p.log.step(message, { ...options, output: process.stderr }),
  warn: (message, options) => p.log.warn(message, { ...options, output: process.stderr }),
  warning: (message, options) => p.log.warning(message, { ...options, output: process.stderr }),
  error: (message, options) => p.log.error(message, { ...options, output: process.stderr }),
};
export const cancel: typeof p.cancel = (message, options) =>
  p.cancel(message, { ...options, output: process.stderr });
export const spinner: typeof p.spinner = (options) =>
  p.spinner({ ...options, output: process.stderr });
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

/** A file as the outro names it, styled, and a link to open it where the terminal has links. */
export const shown = (file: string) => linkToFile(steel(displayPath(file)), file);

/** Relative inside the working directory, `~/…` inside the home directory, absolute elsewhere. */
export function displayPath(file: string): string {
  const fromWorkingDir = relative(process.cwd(), file);
  if (isBelow(fromWorkingDir)) return fromWorkingDir;

  const fromHome = relative(homedir(), file);
  if (isBelow(fromHome)) return join('~', fromHome);

  return file;
}

/** A relative path that stays inside the directory it starts from. */
const isBelow = (path: string) =>
  path !== '' && !isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`);

/** A warning that must not end up in a piped stdout. */
export const warn = (message: string) =>
  log.warn(message, { output: process.stderr, spacing: railStarted ? 1 : 0 });

export function printError(error: unknown): void {
  if (error instanceof ConfigError) {
    log.error(pc.red(error.message));
    for (const issue of error.issues) {
      log.message(`${accent(issue.path || '(root)')}  ${issue.message}`, { symbol: pc.red('│') });
    }
    log.message(dim(error.hint ?? ''));
    printCause(error);
    printDebugStacks(error);
    return;
  }
  if (error instanceof SetcastError) {
    log.error(pc.red(error.message));
    if (error.hint) log.message(dim(error.hint));
    printCause(error);
    printDebugStacks(error);
    return;
  }
  const unexpected = error as Error | undefined;
  log.error(pc.red(unexpected?.message ?? String(error)));
  printCause(error);
  if (process.env.SETCAST_DEBUG === '1') printDebugStacks(error);
  else if (unexpected?.stack) log.message(dim(topOfStack(unexpected.stack)));
}

export const errorExitCode = (error: unknown): 1 | 2 =>
  error instanceof SetcastError ? error.exitCode : 1;

function printCause(error: unknown): void {
  if (!(error instanceof Error) || error.cause === undefined) return;
  log.message(dim(`caused by: ${causeMessage(error.cause)}`));
}

function causeMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === 'string') return cause;
  return JSON.stringify(cause) ?? 'Unknown cause';
}

function printDebugStacks(error: unknown): void {
  if (process.env.SETCAST_DEBUG !== '1' || !(error instanceof Error)) return;
  if (error.stack) log.message(dim(error.stack));
  if (error.cause instanceof Error && error.cause.stack) {
    log.message(dim(`cause stack:\n${error.cause.stack}`));
  }
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

/** Decimal units, as file managers show them: `840 KB`, `4.1 MB`, `2.3 GB`. */
export function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = clamp(Math.floor(Math.log10(bytes) / 3), 0, units.length - 1);
  const size = bytes / 1000 ** exponent;
  const decimals = exponent > 0 && size < 10 ? 1 : 0;
  return `${size.toFixed(decimals)} ${units[exponent]}`;
}

/** A single in-place progress line: `▰▰▰▱▱ 62%  frames 812/1320  eta 14s`. */
export class ProgressLine {
  #start = Date.now();
  #last = '';
  #tick = -1;
  #label: string;
  readonly #width = 24;

  constructor(label: string) {
    this.#label = label;
    process.stderr.write('\n');
  }

  update(progress: number, detail = ''): void {
    if (this.#tooSoon(progress)) return;
    this.#tick = Math.floor(progress * 10);

    const percent = `${String(Math.round(progress * 100)).padStart(3)}%`;
    const line = `${dim('│')}  ${bold(this.#label.padEnd(8))} ${this.#bar(progress)} ${percent}  ${dim(detail)}${dim(this.#eta(progress))}`;
    if (line === this.#last) return;

    process.stderr.write(process.stderr.isTTY ? `\r\x1b[2K${line}` : `${line}\n`);
    this.#last = line;
  }

  /** Without a TTY there is no redraw in place, so a log gets one line per tenth instead. */
  #tooSoon(progress: number): boolean {
    if (process.stderr.isTTY || progress >= 1) return false;
    return Math.floor(progress * 10) === this.#tick;
  }

  #bar(progress: number): string {
    const filled = Math.round(progress * this.#width);
    return accent('▰'.repeat(filled)) + dim('▱'.repeat(this.#width - filled));
  }

  /** Nothing until there is enough progress to extrapolate from, and nothing once it is done. */
  #eta(progress: number): string {
    if (progress <= 0.02 || progress >= 1) return '';
    return `  eta ${formatDuration((this.elapsedSeconds / progress) * (1 - progress))}`;
  }

  get elapsedSeconds(): number {
    return (Date.now() - this.#start) / 1000;
  }

  done(message: string): void {
    process.stderr.write(
      `${process.stdout.isTTY ? '\r\x1b[2K' : ''}${pc.green('◇')}  ${message}\n`,
    );
  }
}

/** `812/1320  24 frames/s`; the rate waits for a second of rendering to measure over. */
function framesDetail(renderedFrames: number, totalFrames: number, seconds: number): string {
  const count = `${renderedFrames}/${totalFrames}`;
  if (seconds < 1) return count;
  return `${count}  ${frameRate(renderedFrames, seconds)}`;
}

const frameRate = (frames: number, seconds: number) => {
  const rate = frames / seconds;
  return `${rate.toFixed(rate < 10 ? 1 : 0)} frames/s`;
};

/**
 * Terminal output for a render or a still: a spinner while the browser and bundle come up, then
 * one progress line per stage. Feed it `onProgress`; finish with `done`.
 */
export class RenderUi {
  readonly #spin = spinner();
  readonly #start = Date.now();
  #frames: ProgressLine | undefined;
  #encode: ProgressLine | undefined;

  constructor() {
    this.#spin.start('Preparing browser');
    showTabBusy();
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
      const frames = this.#framesLine();
      frames.update(progress, framesDetail(renderedFrames, totalFrames, frames.elapsedSeconds));
      showTabProgress(progress);
      return;
    }
    this.#encodeLine(totalFrames).update(progress, 'h264 + aac');
    showTabProgress(progress);
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
    if (!this.#encode) {
      this.#closeFrames(totalFrames);
      this.#encode = new ProgressLine('encode');
    }
    return this.#encode;
  }

  #closeFrames(totalFrames: number): void {
    if (!this.#frames) return;
    const rate = frameRate(totalFrames, this.#frames.elapsedSeconds);
    this.#frames.update(1, `${totalFrames}/${totalFrames}`);
    this.#frames.done(`Rendered ${totalFrames} frames  ${dim('·')}  ${rate}`);
  }

  /** Runs `task`; a failure while the spinner is up clears it so the error prints cleanly. */
  run<T>(task: () => Promise<T>): Promise<T> {
    const clear = () => {
      clearTabProgress();
      if (!this.#frames) this.#spin.clear();
    };
    return clearSpinnerOnError({ clear }, task);
  }

  done(message: string): void {
    clearTabProgress();
    if (this.#encode) this.#encode.done(message);
    else this.#spin.stop(message);
  }

  /** Closes a video render with its length, file size and speed against playback. */
  doneEncoding(durationSeconds: number, bytes: number): void {
    const speed = durationSeconds / ((Date.now() - this.#start) / 1000);
    const summary = [
      `Encoded ${formatDuration(durationSeconds)} of video`,
      formatSize(bytes),
      `${speed.toFixed(speed < 1 ? 2 : 1)}× realtime`,
    ];
    this.done(summary.join(`  ${dim('·')}  `));
  }
}
