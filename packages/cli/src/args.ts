import { parseArgs, type ParseArgsOptionsConfig } from 'node:util';
import { formatTimecode, parseTime, SetcastError } from '@setcast/core';

const PARSE_ERRORS = new Set([
  'ERR_PARSE_ARGS_UNKNOWN_OPTION',
  'ERR_PARSE_ARGS_INVALID_OPTION_VALUE',
  'ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL',
]);

/** Node's strict argument parser with errors written for the command's user. */
export function parseCommandArgs<Options extends ParseArgsOptionsConfig>(
  argv: string[],
  options: Options,
  help: string,
) {
  try {
    return parseArgs({ args: argv, allowPositionals: true, options });
  } catch (error) {
    if (!isParseError(error)) throw error;
    throw new SetcastError(parseErrorMessage(error.message, help), help, { cause: error });
  }
}

const isParseError = (error: unknown): error is Error & { code: string } =>
  error instanceof Error &&
  'code' in error &&
  typeof error.code === 'string' &&
  PARSE_ERRORS.has(error.code);

function parseErrorMessage(message: string, help: string): string {
  const command = help.match(/^setcast\s+\S+/)?.[0] ?? 'setcast';
  const subject = message
    .match(/(?:Unknown option|Option|Unexpected argument) '([^']+)'/)?.[1]
    ?.replace(/ <value>$/, '');

  if (message.startsWith('Unknown option')) return `Unknown option ${subject} for ${command}`;
  if (message.startsWith('Option')) return `Option ${subject} requires a value for ${command}`;
  return `Unexpected argument ${subject} for ${command}`;
}

/** A `--at` value: a timecode or seconds. */
export function parseAt(text: string): number {
  const at = parseTime(text);
  if (at === null || at < 0) {
    throw new SetcastError(
      `Invalid --at "${text}"`,
      'Use a timecode or seconds, e.g. --at 1:04 or --at 64.',
    );
  }
  return at;
}

export interface NumberRange {
  min: number;
  max?: number;
  integer?: boolean;
  /** What to do instead, shown under the error. */
  hint: string;
}

/** A numeric flag value within `range`, or a `SetcastError` naming the flag. */
export function parseNumber(flag: string, text: string, range: NumberRange): number {
  const value = Number(text);
  const whole = !range.integer || Number.isInteger(value);
  const inRange = value >= range.min && value <= (range.max ?? Infinity);
  if (!whole || !inRange) throw new SetcastError(`Invalid --${flag} "${text}"`, range.hint);
  return value;
}

/** Rejects a moment outside the audio before renderer preparation starts. */
export function timeWithinAudio(at: number, duration: number, label: string): number {
  if (at < duration) return at;
  throw new SetcastError(
    `${label} ${formatTimecode(at)} is after the set ends at ${formatTimecode(duration)}`,
    `Choose a time before ${formatTimecode(duration)}.`,
  );
}

/** Rejects an empty range and clips its end to the audio duration. */
export function rangeWithinAudio(
  [start, end]: [number, number],
  duration: number,
  label: string,
): [number, number] {
  timeWithinAudio(start, duration, `${label} starts at`);
  return [start, Math.min(end, duration)];
}
