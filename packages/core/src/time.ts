const TIMECODE = /^(?:(\d+):)?(\d{1,2}):(\d{2}(?:\.\d+)?)$/;

/** Parses "MM:SS", "MM:SS.ms", "H:MM:SS", or plain seconds into seconds. Returns null when unparseable. */
export function parseTime(input: string | number): number | null {
  if (typeof input === 'number') return Number.isFinite(input) && input >= 0 ? input : null;
  const s = input.trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const m = TIMECODE.exec(s);
  if (!m) return null;
  const [, h = '0', min = '0', sec = '0'] = m;
  const minutes = Number(min);
  const seconds = Number(sec);
  if (seconds >= 60 || (m[1] !== undefined && minutes >= 60)) return null;
  return Number(h) * 3600 + minutes * 60 + seconds;
}

/** Splits seconds into whole hours, minutes and seconds. Negatives clamp to zero. */
export function hms(seconds: number): { h: number; m: number; s: number } {
  const total = Math.max(0, Math.floor(seconds));
  return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 };
}

const pad = (n: number) => String(n).padStart(2, '0');

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
  const rounded = Math.round(seconds * 1000) / 1000;
  const whole = Math.floor(rounded);
  const frac = (rounded - whole).toFixed(3).replace(/^0/, '').replace(/0+$/, '');
  return formatTime(whole) + (frac === '.' ? '' : frac);
}
