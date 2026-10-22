import { join, sep } from 'node:path';
import { sceneDirectory } from './copy-scenes.ts';
import type { ProjectConfig } from '../config.ts';
import type { ResolvedProject, ResolvedLiveProject } from '../project.ts';
import { SetcastError } from '../errors.ts';
import { loadLiveProject } from './live.ts';
import type { LoadOptions } from './project.ts';

export async function loadScenes(
  root: string,
  config: ProjectConfig,
  duration: number,
  options: LoadOptions,
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
    const { project } = await loadLiveProject(dir, { themes: options.themes });
    scenes.push({ at: entry.at, scene: rebaseScene(project, entry.preset) });
  }
  return scenes;
}

function rebaseScene(scene: ResolvedLiveProject, preset: string): ResolvedLiveProject {
  const background = scene.background ? join(preset, scene.background).split(sep).join('/') : null;
  return { ...scene, background };
}
