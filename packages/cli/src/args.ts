import { parseTime, SetcastError } from '@setcast/core';

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
