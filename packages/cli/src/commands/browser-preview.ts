import { errorMessage, ConfigError, SetcastError } from '@setcast/core';
import type { LoadedProject } from '@setcast/core/node';
import { load, withWholeSet } from '../project.ts';
import { watchInputs } from '../watch.ts';
import { log, printError } from '../ui.ts';

export async function browserPreview(
  loaded: LoadedProject,
  dependencies: Set<string>,
  options: { port?: number; theme?: string },
) {
  const { preview } = await import('@setcast/renderer-browser/preview');
  const server = await preview(await withWholeSet(loaded), {
    projectDir: loaded.dir,
    port: options.port,
  });
  const stopWatching = watchInputs(
    dependencies,
    async (files) => {
      const next = await load(loaded.dir, options.theme, files);
      server.update(await withWholeSet(next));
    },
    (error) => {
      printError(error);
      server.report(previewError(error));
    },
  );
  log.info(`Open ${server.url} in your browser (Ctrl+C to stop)`);
  log.info(
    'Exact frame inspection with automatic project reload. Use setcast play for audio playback.',
  );
  try {
    await untilStopped();
  } finally {
    await stopWatching();
    await server.close();
  }
}
function untilStopped(): Promise<void> {
  return new Promise((resolve) => {
    const stop = () => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      process.off('SIGHUP', stop);
      resolve();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    process.once('SIGHUP', stop);
  });
}

function previewError(error: unknown) {
  const lines = [errorMessage(error)];
  if (error instanceof ConfigError)
    lines.push(...error.issues.map((issue) => `${issue.path || '(root)'}: ${issue.message}`));
  if (error instanceof SetcastError && error.hint) lines.push(error.hint);
  return lines.join('\n');
}
