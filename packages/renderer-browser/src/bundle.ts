import { pluginRegistration } from '@setcast/core/node';
import type { ResolvedPlugin } from '@setcast/core';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

export async function bundlePlayer(
  entry = 'index.tsx',
  projectDir = '.',
  plugins: ResolvedPlugin[] = [],
): Promise<Map<string, Buffer>> {
  const original = fileURLToPath(new URL(`../entry/${entry}`, import.meta.url));
  const source = plugins.length
    ? `${await pluginRegistration(projectDir, plugins)}\nvoid import(${JSON.stringify(original)});`
    : null;
  const id = fileURLToPath(new URL('../entry/plugins.generated.ts', import.meta.url));
  const built = await build({
    plugins: source
      ? [
          {
            name: 'setcast-plugins',
            resolveId: (name) => (name === id ? id : null),
            load: (name) => (name === id ? source : null),
          },
        ]
      : [],
    configFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    publicDir: false,
    logLevel: 'warn',
    resolve: { dedupe: ['react', 'react-dom', '@setcast/core', 'zod'] },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
      write: false,
      lib: {
        entry: source ? id : original,
        formats: ['es'],
        fileName: () => 'player.js',
        cssFileName: 'player',
      },
    },
  });
  const files = new Map<string, Buffer>();
  for (const output of Array.isArray(built) ? built : [built]) {
    if (!('output' in output)) throw new Error('Player bundling unexpectedly returned a watcher.');
    for (const file of output.output) {
      files.set(`/${file.fileName}`, Buffer.from(file.type === 'chunk' ? file.code : file.source));
    }
  }
  return files;
}
