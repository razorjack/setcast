import type { SetEvent } from './events.ts';
import { formatChapterTime } from './time.ts';

/** YouTube shows chapters only from this many up, and only if each one runs this long. */
export const MIN_CHAPTERS = 3;
export const MIN_CHAPTER_SECONDS = 10;

export interface Chapter {
  time: number;
  text: string;
}

/** One chapter per track and per explicit `chapter` event; the first starts at 00:00 as YouTube requires. */
export function chapterList(events: readonly SetEvent[]): Chapter[] {
  const list: Chapter[] = [];
  for (const e of events.toSorted((a, b) => a.time - b.time)) {
    if (e.type === 'track_start') list.push({ time: e.time, text: `${e.artist} - ${e.title}` });
    else if (e.type === 'chapter') list.push({ time: e.time, text: e.title });
  }
  if (list[0]) list[0].time = 0;
  return list;
}

export const chapters = (events: readonly SetEvent[]): string[] =>
  chapterList(events).map((c) => `${formatChapterTime(c.time)} ${c.text}`);

/**
 * What would stop YouTube from turning the timestamps into chapters. Empty means they work.
 * The last chapter's length is not checked here; only the set's duration decides it.
 */
export function chapterProblems(events: readonly SetEvent[]): string[] {
  const list = chapterList(events);
  const problems: string[] = [];
  if (list.length < MIN_CHAPTERS) {
    problems.push(
      `Only ${list.length} chapter${list.length === 1 ? '' : 's'}. YouTube shows chapters from ${MIN_CHAPTERS} up, so add tracks or chapter events.`,
    );
  }
  for (const [i, c] of list.entries()) {
    const next = list[i + 1];
    if (!next) continue;
    const seconds = Math.round((next.time - c.time) * 10) / 10;
    if (seconds < MIN_CHAPTER_SECONDS) {
      problems.push(
        `"${c.text}" runs ${seconds}s, under YouTube's ${MIN_CHAPTER_SECONDS}s minimum, which turns off chapters for the whole video. Merge it into a neighbour or move ${formatChapterTime(next.time)}.`,
      );
    }
  }
  return problems;
}

export function youtubeDescription(title: string, events: readonly SetEvent[]): string {
  const head = title ? `${title}\n\n` : '';
  return `${head}Tracklist:\n${chapters(events).join('\n')}\n`;
}
