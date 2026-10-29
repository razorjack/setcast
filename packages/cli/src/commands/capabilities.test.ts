import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vite-plus/test';

const cli = fileURLToPath(new URL('../../bin/setcast.js', import.meta.url));

function run(...args: string[]) {
  return spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import { registerHooks } from 'node:module';
    registerHooks({ resolve(specifier, context, next) {
      if (['remotion', '@remotion/', 'playwright', 'vite'].some(name => specifier.startsWith(name)))
        throw new Error('Capability reporting must not load a runtime: ' + specifier);
      return next(specifier, context);
    }});
    process.argv = [process.execPath, ${JSON.stringify(cli)}, 'capabilities', ...${JSON.stringify(args)}];
    await import(${JSON.stringify(cli)});
  `,
    ],
    { cwd: tmpdir(), encoding: 'utf8' },
  );
}

test('capability reports work outside a project without renderer dependencies', () => {
  const remotion = run('--json');
  const browser = run('--renderer', 'browser', '--json');
  for (const result of [remotion, browser]) {
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout).version).toBe(1);
  }
  expect(JSON.parse(remotion.stdout).renderer).toBe('remotion');
  expect(JSON.parse(remotion.stdout).features).toContain('hardwareEncoding');
  expect(JSON.parse(remotion.stdout).features).not.toContain('resume');
  expect(JSON.parse(browser.stdout).features).toContain('resume');
  expect(JSON.parse(browser.stdout).features).toContain('hardwareEncoding');
  expect(run('--renderer', 'browser').stdout).toContain('not a machine check');
});

test('capability usage errors do not produce a JSON report', () => {
  for (const args of [['--renderer', 'missing'], ['project'], ['--unknown']]) {
    const result = run(...args, '--json');
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).not.toBe('');
  }
});
