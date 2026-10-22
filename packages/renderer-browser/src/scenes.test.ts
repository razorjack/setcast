import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';
import { loadLiveProject, saveScene } from '@setcast/core/node';
import { savedScene, savedScenes } from './scenes.ts';

test('scene bank lists manual saves, rebases assets, and rejects root and escaped presets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'setcast-scene-bank-'));
  const outside = await mkdtemp(join(tmpdir(), 'setcast-scene-outside-'));
  try {
    await writeFile(join(root, 'own.css'), '');
    await writeFile(join(root, 'art.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await writeFile(
      join(root, 'live.yaml'),
      'theme: ./own.css\nbackground: art.svg\ntitle: Booth\n',
    );
    const { project } = await loadLiveProject(root);
    const selection = {
      theme: 'own',
      art: 'project' as const,
      performance: { intensity: 0.5, brightness: 0.6 },
    };
    const saved = await saveScene(root, project, selection);
    await saveScene(root, project, selection, 'journal');
    expect(await savedScenes(root)).toEqual([{ preset: saved.directory, title: 'Booth' }]);
    const recalled = await savedScene(root, saved.directory);
    expect(recalled.background).toBe(`${saved.directory}/assets/0.svg`);
    expect(recalled.performance).toEqual(selection.performance);
    await expect(savedScene(root, '.')).rejects.toThrow('names its root');
    await symlink(outside, join(root, 'saved-scene-escape'));
    await expect(savedScene(root, 'saved-scene-escape')).rejects.toThrow('leaves the project');
    expect(await savedScenes(root)).toHaveLength(1);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
