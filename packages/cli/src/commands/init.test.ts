import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, test } from 'vite-plus/test';

const execute = promisify(execFile);
const cli = fileURLToPath(new URL('../../bin/setcast.js', import.meta.url));

test.each(['bg.png', 'demo-set.wav'])(
  'init preserves existing %s before writing anything',
  async (asset) => {
    const dir = await mkdtemp(join(tmpdir(), 'setcast-init-'));
    try {
      await mkdir(join(dir, 'assets'));
      await writeFile(join(dir, 'assets', asset), 'user asset');
      await expect(
        execute(process.execPath, [cli, 'init', dir, '--demo', '--yes']),
      ).rejects.toMatchObject({
        code: 2,
      });
      expect(await readFile(join(dir, 'assets', asset), 'utf8')).toBe('user asset');
      expect(await readdir(dir)).toEqual(['assets']);
      expect(await readdir(join(dir, 'assets'))).toEqual([asset]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
