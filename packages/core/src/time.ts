const TIMECODE = /^(?:(\d+):)?(\d{1,2}):(\d{2}(?:\.\d+)?)$/;

/** Parses "MM:SS", "MM:SS.ms", "H:MM:SS", or plain seconds into seconds. Returns null when unparseable. */
export function parseTime(input: string | number): number | null {
  if (typeof input === 'number') return Number.isFinite(input) && input >= 0 ? input : null;
  const s = input.trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const m = TIMECODE.exec(s);
  if (!m) return null;
  const [, h = '0', min = '0', sec = '0'] = m;
  return Number(h) * 3600 + Number(min) * 60 + Number(sec);
}

/** Formats seconds as "MM:SS" (or "H:MM:SS" past an hour). */
export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

/** Formats seconds as "HH:MM:SS" or "MM:SS" the way YouTube chapter lists expect. */
export function formatChapterTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
