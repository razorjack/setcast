import type { SetEvent } from './events.ts';
import { formatChapterTime } from './time.ts';

/** YouTube chapter lines: one per track (and explicit `chapter` events); the first starts at 00:00 as YouTube requires. */
export function chapters(events: readonly SetEvent[]): string[] {
  const entries: { time: number; text: string }[] = [];
  for (const e of events.toSorted((a, b) => a.time - b.time)) {
    if (e.type === 'track_start') entries.push({ time: e.time, text: `${e.artist} - ${e.title}` });
    else if (e.type === 'chapter') entries.push({ time: e.time, text: e.title });
  }
  if (entries[0]) entries[0].time = 0;
  return entries.map((c) => `${formatChapterTime(c.time)} ${c.text}`);
}

export function youtubeDescription(title: string, events: readonly SetEvent[]): string {
  const head = title ? `${title}\n\n` : '';
  return `${head}Tracklist:\n${chapters(events).join('\n')}\n`;
}
