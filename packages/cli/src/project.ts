import { resolve } from 'node:path';
import type { ResolvedProject } from '@setcast/core';
import { loadProject, readWholeSet, readsWholeSet, type LoadedProject } from '@setcast/core/node';
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
 * The project with what it reads from the whole set filled in: the envelope a visualizer draws,
 * the travel its CSS reads. Reading a long set takes seconds, so commands call this after
 * everything they can validate first.
 */
export async function withWholeSet({ dir, project }: LoadedProject): Promise<ResolvedProject> {
  if (!readsWholeSet(project)) return project;

  const spin = spinner();
  spin.start(`Reading all of ${project.audio}`);
  const whole = await clearSpinnerOnError(spin, () => readWholeSet(project, dir));
  spin.stop('Read the whole set');
  return whole;
}
