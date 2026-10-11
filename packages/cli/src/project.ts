import { join, resolve } from 'node:path';
import { drawsWholeSet, type ResolvedProject } from '@setcast/core';
import { loadProject, readSetEnvelope, type LoadedProject } from '@setcast/core/node';
import { probeAudio } from '@setcast/renderer-remotion';
import { themes } from '@setcast/themes';
import { clearSpinnerOnError, spinner, warn } from './ui.ts';

const warned = new Set<string>();

/**
 * Loads the project in `dir`; `theme` replaces the one its setcast.yaml names. A command that
 * loads the project once per theme prints each warning once.
 */
export async function load(
  dir = '.',
  theme?: string,
  dependencies?: Set<string>,
): Promise<LoadedProject> {
  const loaded = await loadProject(resolve(dir), {
    themes,
    dependencies,
    theme,
    probeDuration: (audio, root) => probeAudio({ audio }, root),
  });
  for (const warning of loaded.warnings) {
    if (warned.has(warning)) continue;
    warned.add(warning);
    warn(warning);
  }
  return loaded;
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
