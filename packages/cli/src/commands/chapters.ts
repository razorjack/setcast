import { chapterProblems, youtubeDescription } from '@setcast/core';
import { load } from '../project.ts';
import { warn } from '../ui.ts';

export const help = `setcast chapters [dir]

Prints a YouTube description with chapter timestamps derived from the tracklist.
Anything that would stop YouTube from showing the chapters is reported on stderr.`;

export async function run(argv: string[]): Promise<void> {
  const { project } = await load(argv[0]);
  process.stdout.write(youtubeDescription(project.title, project.events));
  for (const problem of chapterProblems(project.events)) warn(problem);
}
