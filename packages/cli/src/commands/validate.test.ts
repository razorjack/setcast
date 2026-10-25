import { spawnSync } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vite-plus/test';

const cli = fileURLToPath(new URL('../../bin/setcast.js', import.meta.url));
const run = (...args: string[]) =>
  spawnSync(process.execPath, [cli, 'validate', ...args], { encoding: 'utf8' });

test('validation CLI returns clean JSON for defaults, warnings and configuration failures', async () => {
  const root = await mkdtemp(join(tmpdir(), 'setcast-validate-cli-'));
  try {
    const defaults = run(root, '--live', '--json');
    expect(defaults.status).toBe(0);
    expect(defaults.stderr).toBe('');
    expect(JSON.parse(defaults.stdout)).toMatchObject({
      version: 1,
      valid: true,
      documents: [{ usesDefaults: true }],
    });
    await writeFile(join(root, 'live.yaml'), 'visualizer: {name: overview}');
    const warning = run(root, '--live', '--json');
    expect(warning.status).toBe(0);
    expect(warning.stderr).toBe('');
    expect(JSON.parse(warning.stdout).diagnostics[0].level).toBe('warning');
    await writeFile(join(root, 'live.yaml'), 'output: {fps: 17}');
    const invalid = run(root, '--live', '--json');
    expect(invalid.status).toBe(2);
    expect(invalid.stderr).toBe('');
    expect(JSON.parse(invalid.stdout)).toMatchObject({
      valid: false,
      exitCode: 2,
      diagnostics: [{ file: 'live.yaml', path: 'output.fps' }],
    });
    const readable = run(root, '--live');
    expect(readable.status).toBe(2);
    expect(readable.stdout).toContain('live.yaml:output.fps');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('validation usage errors do not masquerade as project reports', () => {
  const result = run('one', 'two', '--json');
  expect(result.status).toBe(2);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain('one project directory');
});

test('validation CLI checks configured and overridden renderers without importing rendering libraries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'setcast-renderer-validation-'));
  try {
    await copyFile(
      new URL('../../../core/src/node/fixtures/probe-tone.mp3', import.meta.url),
      join(root, 'tone.mp3'),
    );
    await writeFile(
      join(root, 'setcast.yaml'),
      'audio: tone.mp3\noutput: {parallelEncoding: false}',
    );
    const source = `
      import { registerHooks } from 'node:module';
      registerHooks({ resolve(specifier, context, next) {
        if (['remotion', '@remotion/', 'playwright'].some(name => specifier.startsWith(name)))
          throw new Error('Validation must not load a rendering library');
        return next(specifier, context);
      }});
      process.argv = [process.execPath, ${JSON.stringify(cli)}, 'validate', ${JSON.stringify(root)}, '--json', ...process.argv.slice(1)];
      await import(${JSON.stringify(cli)});
    `;
    const invoke = (...args: string[]) =>
      spawnSync(process.execPath, ['--input-type=module', '-e', source, '--', ...args], {
        encoding: 'utf8',
      });
    const original = await readFile(join(root, 'setcast.yaml'), 'utf8');
    const remotion = invoke();
    expect(remotion.status, remotion.stderr).toBe(0);
    expect(JSON.parse(remotion.stdout).renderer).toEqual({ name: 'remotion', checked: true });
    const browser = invoke('--renderer', 'browser');
    expect(browser.status, browser.stderr).toBe(2);
    expect(browser.stderr).toBe('');
    expect(JSON.parse(browser.stdout)).toMatchObject({
      renderer: { name: 'browser', checked: true },
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: 'renderer',
          file: 'setcast.yaml',
          path: 'output.parallelEncoding',
        }),
      ]),
    });
    expect(await readFile(join(root, 'setcast.yaml'), 'utf8')).toBe(original);
    const live = run(root, '--live', '--renderer', 'browser', '--json');
    expect(live.status).toBe(2);
    expect(live.stdout).toBe('');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
