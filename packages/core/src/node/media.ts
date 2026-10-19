import { resolve } from 'node:path';
import { SetcastError } from '../errors.ts';
import type { ResolvedProject } from '../project.ts';
import { ALL_FORMATS, FilePathSource, Input } from 'mediabunny';

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

/** Length of a local audio file, after confirming that the container has an audio track. */
export async function audioDuration(file: string): Promise<number> {
  const input = new Input({ formats: ALL_FORMATS, source: new FilePathSource(file) });
  try {
    const audio = await input.getPrimaryAudioTrack();
    if (!audio) throw new Error('Input has no audio track.');
    return (await audio.getDurationFromMetadata()) ?? (await audio.computeDuration());
  } finally {
    input.dispose();
  }
}
