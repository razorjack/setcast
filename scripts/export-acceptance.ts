import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import type { Exporter } from '../packages/core/src/index.ts';
import { runAcceptance } from './export-acceptance/suite.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const { values } = parseArgs({
  options: {
    adapter: { type: 'string', default: resolve(root, 'packages/renderer-remotion/src/index.ts') },
    out: { type: 'string', default: resolve(root, 'examples/demo/out/export-acceptance') },
    reference: { type: 'string' },
  },
});
for (const command of ['ffmpeg', 'ffprobe'])
  execFileSync(command, ['-version'], { stdio: 'ignore' });
const exporter: Exporter = await import(pathToFileURL(resolve(values.adapter)).href);
console.log(`export-acceptance: ${values.adapter}`);
await runAcceptance(exporter, resolve(values.out), values.reference && resolve(values.reference));
console.log(`export-acceptance: PASS (artifacts: ${values.out})`);
