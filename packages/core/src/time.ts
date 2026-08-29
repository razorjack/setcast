const TIMECODE = /^(?:(\d+):)?(\d{1,2}):(\d{2}(?:\.\d+)?)$/;

/** Parses "MM:SS", "MM:SS.ms", "H:MM:SS", or plain seconds into seconds. Returns null when unparseable. */
export function parseTime(input: string | number): number | null {
  if (typeof input === 'number') return Number.isFinite(input) && input >= 0 ? input : null;

  const text = input.trim();
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);

  const match = TIMECODE.exec(text);
  if (!match) return null;

  const [, hoursText, minutesText = '0', secondsText = '0'] = match;
  const hours = Number(hoursText ?? '0');
  const minutes = Number(minutesText);
  const seconds = Number(secondsText);
  if (seconds >= 60) return null;
  if (hoursText !== undefined && minutes >= 60) return null;

  return hours * 3600 + minutes * 60 + seconds;
}

/** Splits seconds into whole hours, minutes and seconds. Negatives clamp to zero. */
export function hms(seconds: number): { h: number; m: number; s: number } {
  const total = Math.max(0, Math.floor(seconds));
  return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 };
}

const pad = (part: number) => String(part).padStart(2, '0');

/** Formats seconds as "MM:SS" (or "H:MM:SS" past an hour). */
export function formatTime(seconds: number): string {
  const { h, m, s } = hms(seconds);
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Formats seconds as "HH:MM:SS" or "MM:SS" the way YouTube chapter lists expect. */
export function formatChapterTime(seconds: number): string {
  const { h, m, s } = hms(seconds);
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * Formats seconds the way `setcast.yaml` writes a time: `3:45.5`. `formatTime` alone floors the
 * fraction away, and both tracklists and detected events carry one.
 */
export function formatTimecode(seconds: number): string {
  const [whole, fraction] = seconds.toFixed(3).split('.') as [string, string];
  return formatTime(Number(whole)) + trimmedFraction(fraction);
}

/** `500` becomes `.5`, `000` becomes nothing: no trailing zeros in a hand-edited config. */
const trimmedFraction = (fraction: string) => `.${fraction}`.replace(/\.?0+$/, '');
