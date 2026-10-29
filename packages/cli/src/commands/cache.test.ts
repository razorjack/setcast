import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vite-plus/test';

const cli = fileURLToPath(new URL('../../bin/setcast.js', import.meta.url));
const run = (...args: string[]) =>
  spawnSync(process.execPath, [cli, 'cache', ...args], {
    encoding: 'utf8',
    env: { ...process.env, PATH: '' },
  });

test('cache management works without FFmpeg and preserves unrelated files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'setcast-cache-cli-'));
  try {
    await writeFile(
      join(root, 'setcast-cache.json'),
      '{"format":"setcast-render-cache","version":1}\n',
    );
    await writeFile(join(root, 'index.json'), '{"version":1,"entries":{}}');
    await writeFile(join(root, 'keep.txt'), 'keep');
    const inspected = run('inspect', root, '--json');
    expect(inspected.status, inspected.stderr).toBe(0);
    expect(JSON.parse(inspected.stdout)).toMatchObject({ version: 1, bytes: 0, entries: [] });
    await writeFile(join(root, 'index.json'), '{');
    const cleared = run('clear', root);
    expect(cleared.status, cleared.stderr).toBe(0);
    expect(await readFile(join(root, 'keep.txt'), 'utf8')).toBe('keep');
    expect(run('clear', root, '--json').status).toBe(2);
    expect(run('inspect').status).toBe(2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
