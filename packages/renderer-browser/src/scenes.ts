import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { loadLiveProject, rebaseScene, sceneDirectory } from '@setcast/core/node';

export async function savedScenes(root: string) {
  const entries = await readdir(root, { withFileTypes: true });
  const candidates = entries.filter(
    (entry) => entry.isDirectory() && entry.name.startsWith('saved-scene-'),
  );
  const dated = await Promise.all(
    candidates.map(async (entry) => ({
      entry,
      created: (await stat(join(root, entry.name))).birthtimeMs,
    })),
  );
  const ordered = dated.sort(
    (a, b) => a.created - b.created || a.entry.name.localeCompare(b.entry.name),
  );
  const scenes: { preset: string; title: string }[] = [];
  for (const { entry } of ordered.slice(0, 64)) {
    try {
      if (!(await stat(join(root, entry.name, 'live.yaml'))).isFile()) continue;
      const project = await savedScene(root, entry.name);
      scenes.push({ preset: entry.name, title: project.title || project.theme });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return scenes;
}

export async function savedScene(root: string, preset: string) {
  const directory = await sceneDirectory(root, preset);
  const { project } = await loadLiveProject(directory);
  return rebaseScene(project, preset);
}
