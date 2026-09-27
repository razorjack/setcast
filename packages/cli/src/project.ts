import { join, resolve } from 'node:path';
import { drawsWholeSet, formatTimecode, type ResolvedProject, type SetEvent } from '@setcast/core';
import { loadProject, readSetEnvelope, type LoadedProject } from '@setcast/core/node';
import { themes } from '@setcast/themes';
import { clearSpinnerOnError, spinner, warn } from './ui.ts';

export async function load(dir = '.'): Promise<LoadedProject> {
  const loaded = await loadProject(resolve(dir), { themes });
  for (const warning of loaded.warnings) warn(warning);
  return loaded;
}

export function warnEventsAfterAudio(events: readonly SetEvent[], duration: number): void {
  for (const event of events) {
    if (event.time > duration) {
      warn(
        `${event.type} event at ${formatTimecode(event.time)} is after the audio ends at ${formatTimecode(duration)}.`,
      );
    }
  }
}

/**
 * The project with `envelope` filled in when a visualizer draws the whole set. Reading a long set
 * takes seconds, so commands call this after everything they can validate first.
 */
export async function withSetEnvelope({ dir, project }: LoadedProject): Promise<ResolvedProject> {
  if (!drawsWholeSet(project)) return project;

  const spin = spinner();
  spin.start(`Reading all of ${project.audio}`);
  const envelope = await clearSpinnerOnError(spin, () => readSetEnvelope(join(dir, project.audio)));
  spin.stop('Read the whole set');
  return { ...project, envelope };
}
