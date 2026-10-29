import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vite-plus/test';

const cli = fileURLToPath(new URL('../../bin/setcast.js', import.meta.url));

test('missing runtime tools yield one actionable JSON report without downloading or importing Remotion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'setcast-doctor-missing-'));
  try {
    const source = `
      import { registerHooks } from 'node:module';
      registerHooks({ resolve(specifier, context, next) {
        if (specifier.startsWith('@remotion/') || specifier === 'remotion')
          throw new Error('The browser doctor must not import Remotion');
        return next(specifier, context);
      }});
      process.argv = [process.execPath, ${JSON.stringify(cli)}, 'doctor', '--renderer', 'browser', '--json'];
      await import(${JSON.stringify(cli)});
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
      cwd: directory,
      encoding: 'utf8',
      env: { ...process.env, PATH: directory, PLAYWRIGHT_BROWSERS_PATH: directory },
    });
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toBe('');
    const report = JSON.parse(result.stdout);
    expect(report).toMatchObject({
      version: 1,
      ready: false,
      exitCode: 1,
      features: { video: 'unavailable', resume: 'unavailable', hardwareEncoding: 'unavailable' },
    });
    for (const id of ['browser.launch', 'ffmpeg', 'ffprobe'])
      expect(report.checks.find((check: { id: string }) => check.id === id)).toMatchObject({
        status: 'fail',
        hint: expect.any(String),
      });
    expect(
      report.checks.find((check: { id: string }) => check.id === 'browser.launch').hint,
    ).toContain('browser-install');
    expect(await readdir(directory)).toEqual([]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('doctor rejects invalid flags before starting runtime probes', () => {
  for (const args of [
    ['project'],
    ['--require', 'video,unknown'],
    ['--require', ''],
    ['--renderer', 'browser', '--gl', 'vulkan'],
    ['--timeout', 'Infinity'],
    ['--timeout', '0'],
  ]) {
    const result = spawnSync(process.execPath, [cli, 'doctor', ...args, '--json'], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).not.toBe('');
  }
});
