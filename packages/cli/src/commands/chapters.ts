import { youtubeDescription } from '@setcast/core';
import { load } from '../project.ts';

export const help = `setcast chapters [dir]

Prints a YouTube description with chapter timestamps derived from the tracklist.`;

export async function run(argv: string[]): Promise<void> {
  const { project } = await load(argv[0]);
  process.stdout.write(youtubeDescription(project.title, project.events));
}
