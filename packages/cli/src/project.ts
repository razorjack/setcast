import { resolve } from 'node:path';
import { resolveVisualizerConfig } from '@setcast/core';
import { loadProject, type LoadedProject } from '@setcast/core/node';
import { themes } from '@setcast/themes';

export async function load(dir = '.'): Promise<LoadedProject> {
  const loaded = await loadProject(resolve(dir), { themes });
  loaded.project.visualizer = resolveVisualizerConfig(loaded.project.visualizer);
  return loaded;
}
