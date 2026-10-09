import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, test } from 'vite-plus/test';
import { parse } from 'yaml';

const cli = fileURLToPath(new URL('../../bin/setcast.js', import.meta.url));
const execute = promisify(execFile);
const run = (...args: string[]) =>
  execute(process.execPath, [cli, ...args], { env: { ...process.env, NO_COLOR: '1' } });

test('scaffold, inspect, import and analysis write the new contract without losing evidence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'setcast-mix-cli-'));
  try {
    await run('init', dir, '--demo', '--yes');
    const inspected = JSON.parse((await run('inspect', dir, '--json')).stdout);
    expect(inspected.plays).toHaveLength(3);
    expect(
      inspected.contributions.every((interval: { until: number }) =>
        Number.isSafeInteger(interval.until),
      ),
    ).toBe(true);
    const tracklist = join(dir, 'tracklist.txt');
    await writeFile(tracklist, '00:00 First title\n00:10 Artist - Second title\n');
    await run('import', tracklist, '--write', dir);
    const imported = parse(await readFile(join(dir, 'setcast.yaml'), 'utf8'));
    expect(imported.plays[0]).toMatchObject({
      title: 'First title',
      evidence: ['imported-tracklist'],
    });
    expect(imported.plays[0].artist).toBeUndefined();
    expect(imported.sources['imported-tracklist'].note).toContain('not measured');
    await run('analyze', dir, '--write');
    const once = await readFile(join(dir, 'setcast.yaml'), 'utf8');
    await run('analyze', dir, '--write');
    expect(await readFile(join(dir, 'setcast.yaml'), 'utf8')).toBe(once);
    const mix = JSON.parse((await run('inspect', dir, '--at', '0:05', '--json')).stdout);
    expect(mix.currentPlayCount).toBe(1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 20_000);
