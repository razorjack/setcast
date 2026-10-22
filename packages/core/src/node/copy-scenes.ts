import { cp, lstat, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { SetcastError } from '../errors.ts';

export async function sceneDirectory(root: string, preset: string): Promise<string> {
  const source = await realpath(resolve(root, preset));
  const inside = relative(await realpath(root), source);
  if (!inside || isAbsolute(preset) || outside(inside))
    throw new SetcastError(
      `Scene directory leaves the project or names its root: ${preset}`,
      'Keep each saved scene in its own directory inside the project.',
    );
  return source;
}

/** Presets contain copied media, so links are unnecessary and must not escape on relocation. */
export async function copySceneDirectory(source: string, target: string) {
  if (!outside(relative(source, target)))
    throw new SetcastError(
      'Cannot copy a scene into itself.',
      'Choose a separate saved-scene directory.',
    );
  await cp(source, target, {
    recursive: true,
    filter: async (path) => {
      const info = await lstat(path);
      if (!info.isFile() && !info.isDirectory())
        throw new SetcastError(
          `Cannot copy scene entry ${path}.`,
          'Replace symbolic links and special files with regular files.',
        );
      return true;
    },
  });
}

function outside(path: string) {
  return path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path);
}
