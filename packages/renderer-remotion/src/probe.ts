import { resolve } from 'node:path';
import { SetcastError, type ResolvedProject } from '@setcast/core';
import { audioDuration } from './duration.ts';

/** Validates the project audio in Node before browser preparation and returns its duration. */
export async function probeAudio(project: ResolvedProject, projectDir: string): Promise<number> {
  try {
    return await audioDuration(resolve(projectDir, project.audio));
  } catch (cause) {
    throw new SetcastError(
      `Cannot read ${project.audio} as audio`,
      'Setcast reads wav, mp3, m4a and flac. Check the file plays, or re-export it.',
      { cause },
    );
  }
}
