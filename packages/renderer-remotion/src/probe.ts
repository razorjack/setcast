import { resolve } from 'node:path';
import { SetcastError, type ResolvedProject } from '@setcast/core';
import { audioDuration } from './media.ts';

/** Validates the project audio in Node before browser preparation and returns its duration. */
export async function probeAudio(
  project: Pick<ResolvedProject, 'audio'>,
  projectDir: string,
): Promise<number> {
  try {
    const duration = await audioDuration(resolve(projectDir, project.audio));
    if (!Number.isFinite(duration) || duration <= 0)
      throw new Error(`Audio duration ${duration} must be finite and positive.`);
    return duration;
  } catch (cause) {
    throw new SetcastError(
      `Cannot read ${project.audio} as audio`,
      'Setcast reads wav, mp3, m4a and flac. Check the file plays, or re-export it.',
      { cause },
    );
  }
}
