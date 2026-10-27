import { join, sep } from 'node:path';
import { sceneDirectory } from './copy-scenes.ts';
import type { ProjectConfig } from '../config.ts';
import type { ResolvedProject, ResolvedLiveProject } from '../project.ts';
import { ConfigError, SetcastError } from '../errors.ts';
import { loadLiveProject } from './live.ts';
import type { LoadOptions } from './project.ts';

export async function loadScenes(
  root: string,
  config: ProjectConfig,
  duration: number,
  options: Pick<LoadOptions, 'themes' | 'dependencies'>,
) {
  const scenes: NonNullable<ResolvedProject['scenes']> = [];
  for (const entry of config.scenes ?? []) {
    if (entry.at >= duration || (scenes.at(-1)?.at ?? -1) >= entry.at) {
      throw new SetcastError(
        `Invalid scene time ${entry.at} in scenes[].at`,
        'Use strictly increasing scene times inside the recording.',
      );
    }
    const dir = await sceneDirectory(root, entry.preset);
    options.dependencies?.add(join(dir, 'live.yaml'));
    try {
      const { project } = await loadLiveProject(dir, { themes: options.themes });
      scenes.push({ at: entry.at, scene: rebaseScene(project, entry.preset) });
    } catch (error) {
      if (error instanceof ConfigError)
        throw new ConfigError(join(entry.preset, error.file).split(sep).join('/'), error.issues);
      throw error;
    }
  }
  return scenes;
}

/** A scene's media paths, relative to the directory that contains the scene's directory. */
export function rebaseScene(scene: ResolvedLiveProject, preset: string): ResolvedLiveProject {
  const rebase = (path: string) => join(preset, path).split(sep).join('/');
  const background = scene.background ? rebase(scene.background) : null;
  const logo = scene.branding?.logo;
  const branding =
    scene.branding && logo ? { ...scene.branding, logo: rebase(logo) } : scene.branding;
  return { ...scene, background, branding };
}
