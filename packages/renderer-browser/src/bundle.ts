import { fileURLToPath } from 'node:url';
import { build } from 'vite';

export async function bundlePlayer(entry = 'index.tsx'): Promise<Map<string, Buffer>> {
  const built = await build({
    configFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)),
    publicDir: false,
    logLevel: 'warn',
    resolve: { dedupe: ['react', 'react-dom'] },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
      write: false,
      lib: {
        entry: fileURLToPath(new URL(`../entry/${entry}`, import.meta.url)),
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
