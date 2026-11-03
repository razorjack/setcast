import { resolve } from 'node:path';
import type { RenderOptions, ResolvedProject, RendererName } from '@setcast/core';
import {
  loadProject,
  probeAudio,
  readWholeSet,
  readsWholeSet,
  type LoadedProject,
  type WholeSetReader,
} from '@setcast/core/node';
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
 * The project with hardware encoding settled: `if-possible` becomes `disable` where the encoder
 * cannot start. Commands call this before their progress UI, so the warning prints on its own line.
 */
export async function withHardwareEncoding(
  loaded: LoadedProject,
  renderer?: RendererName,
): Promise<LoadedProject> {
  const { resolveHardwareEncoding } = await import('./renderer.ts');
  const { output } = loaded.config;
  const { hardwareAcceleration, fallback } = await resolveHardwareEncoding(
    output.hardwareAcceleration,
    {
      width: loaded.project.width,
      height: loaded.project.height,
      fps: loaded.project.fps,
      videoBitrate: output.videoBitrate,
    },
    renderer,
  );
  if (fallback) warn(fallback);
  return { ...loaded, config: { ...loaded.config, output: { ...output, hardwareAcceleration } } };
}

/**
 * The project with what it reads from the whole set filled in: the envelope a visualizer draws,
 * the travel its CSS reads. Reading a long set takes seconds, so commands call this after
 * everything they can validate first.
 */
export async function withWholeSet(
  { dir, project }: LoadedProject,
  reader?: WholeSetReader,
  cache?: RenderOptions['cache'],
): Promise<ResolvedProject> {
  if (!readsWholeSet(project)) return project;

  const spin = spinner();
  spin.start(`Preparing audio features for ${project.audio}`);
  let reused = false;
  const whole = await clearSpinnerOnError(spin, async () => {
    if (!cache) return reader ? reader.read(project, dir) : readWholeSet(project, dir);
    const { prepareProject } = await import('@setcast/renderer-browser/export');
    return prepareProject(project, {
      projectDir: dir,
      cache,
      onPreparation: (status) => {
        reused = status === 'reused';
      },
    });
  });
  spin.stop(reused ? 'Reused prepared audio features' : 'Audio features ready');
  return whole;
}
