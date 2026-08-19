import * as p from '@clack/prompts';
import { ConfigError, SetcastError } from '@setcast/core';
import pc from 'picocolors';

const rgb = (r: number, g: number, b: number) => (s: string) =>
  pc.isColorSupported ? `\x1b[38;2;${r};${g};${b}m${s}\x1b[39m` : s;
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
  const e = error as Error;
  p.log.error(pc.red(e?.message ?? String(error)));
  if (e?.stack) p.log.message(dim(e.stack.split('\n').slice(1, 6).join('\n')));
}

export const fmtSeconds = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}m ${String(sec).padStart(2, '0')}s` : `${sec}s`;
};

/** A single in-place progress line: `▰▰▰▱▱ 62%  frames 812/1320  eta 14s`. */
export class ProgressLine {
  #start = Date.now();
  #last = '';
  #label: string;
  readonly #width = 24;

  constructor(label: string) {
    this.#label = label;
    process.stdout.write('\n');
  }

  update(progress: number, detail = ''): void {
    const filled = Math.round(progress * this.#width);
    const bar = accent('▰'.repeat(filled)) + dim('▱'.repeat(this.#width - filled));
    const pct = `${String(Math.round(progress * 100)).padStart(3)}%`;
    const elapsed = (Date.now() - this.#start) / 1000;
    const eta =
      progress > 0.02 && progress < 1
        ? `  eta ${fmtSeconds((elapsed / progress) * (1 - progress))}`
        : '';
    const line = `${dim('│')}  ${bold(this.#label.padEnd(8))} ${bar} ${pct}  ${dim(detail)}${dim(eta)}`;
    if (line !== this.#last) {
      process.stdout.write(`\r\x1b[2K${line}`);
      this.#last = line;
    }
  }

  done(message: string): void {
    process.stdout.write(`\r\x1b[2K${pc.green('◇')}  ${message}\n`);
  }
}
