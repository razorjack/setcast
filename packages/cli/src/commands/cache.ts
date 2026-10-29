import { SetcastError } from '@setcast/core';
import { parseCommandArgs } from '../args.ts';
import { clearRenderCache, inspectRenderCache } from '@setcast/renderer-browser/export';

export const help = `setcast cache <inspect|clear> <directory> [--json]

Inspect or clear a persistent browser-renderer chunk cache created with render --cache.
  inspect   list indexed chunks, byte counts and last-use times; no browser or FFmpeg is started
  clear     remove managed cached chunks and reset the index, preserving unrelated files
  --json    print a machine-readable inspection report

Operations require the cache writer lock. Confirm a stale lock's process has stopped before
removing lock.json. Byte counts cover indexed video chunks, excluding metadata and working exports.`;

export async function run(argv: string[]) {
  const { values, positionals } = parseCommandArgs(argv, { json: { type: 'boolean' } }, help);
  const [operation, directory] = positionals;
  if (positionals.length !== 2 || !directory || !['inspect', 'clear'].includes(operation!))
    throw new SetcastError('Specify cache inspect or clear and a cache directory.', help);
  if (operation === 'clear') {
    if (values.json)
      throw new SetcastError(
        '--json is supported by cache inspect only.',
        'Omit --json to clear the cache.',
      );
    await clearRenderCache(directory);
    process.stdout.write('Render cache cleared.\n');
    return;
  }
  const report = await inspectRenderCache(directory);
  if (values.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else
    process.stdout.write(
      `${report.directory}\n${report.entries.length} chunks, ${(report.bytes / 1024 / 1024).toFixed(2)} MiB indexed video\n`,
    );
}
