import type { MixDocument } from './mix-schema.ts';
import { formatChapterTime, toSeconds } from './time.ts';

export const MIN_CHAPTERS = 3;
export const MIN_CHAPTER_SECONDS = 10;
export type Chapter = MixDocument['chapters'][number];
export const chapterList = (mix: MixDocument): Chapter[] => mix.chapters;
export const chapters = (mix: MixDocument): string[] =>
  mix.chapters.map((chapter) => `${formatChapterTime(toSeconds(chapter.at))} ${chapter.title}`);

export function chapterProblems(mix: MixDocument): string[] {
  const list = mix.chapters;
  if (!list.length) return [];
  const problems: string[] = [];
  if (list.length < MIN_CHAPTERS)
    problems.push(
      `Only ${list.length} chapters; YouTube needs at least ${MIN_CHAPTERS}. Add listings or explicit chapters.`,
    );
  if (list[0]!.at !== 0)
    problems.push(
      'The first chapter is not at 00:00. Add an explicit chapter at zero for YouTube; authored timestamps are preserved.',
    );
  for (const [index, chapter] of list.entries()) {
    const end = list[index + 1]?.at ?? mix.duration;
    const seconds = Math.floor(toSeconds(end)) - Math.floor(toSeconds(chapter.at));
    if (seconds < MIN_CHAPTER_SECONDS)
      problems.push(
        `"${chapter.title}" runs ${seconds}s in the exported timestamps, under YouTube's ${MIN_CHAPTER_SECONDS}s minimum. Merge it with a neighbour or move its timestamp.`,
      );
  }
  return problems;
}
export function youtubeDescription(title: string, mix: MixDocument): string {
  const head = title ? `${title}\n\n` : '';
  return mix.chapters.length ? `${head}Tracklist:\n${chapters(mix).join('\n')}\n` : `${title}\n`;
}
