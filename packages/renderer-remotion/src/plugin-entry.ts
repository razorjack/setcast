import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ResolvedPlugin } from '@setcast/core';
import { pluginRegistration } from '@setcast/core/node';
import { ENTRY } from './paths.ts';

export async function pluginCompositionEntry(
  projectDir: string,
  plugins: ResolvedPlugin[],
  directory: string,
) {
  if (!plugins.length) return ENTRY;
  const source = await pluginRegistration(projectDir, plugins);
  const remotion = fileURLToPath(import.meta.resolve('remotion'));
  const composition = fileURLToPath(import.meta.resolve('@setcast/renderer-remotion/composition'));
  const entry = join(directory, 'entry.mjs');
  await writeFile(
    entry,
    [
      source,
      `import { registerRoot } from ${JSON.stringify(remotion)};`,
      `import { Root } from ${JSON.stringify(composition)};`,
      'registerRoot(Root);',
    ].join('\n'),
  );
  return entry;
}
