import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vite-plus/test';

const cli = fileURLToPath(new URL('../../bin/setcast.js', import.meta.url));

test('schema CLI emits standalone JSON outside a project without loading a renderer', () => {
  const result = spawnSync(process.execPath, [cli, 'schema', 'live'], {
    cwd: tmpdir(),
    encoding: 'utf8',
  });
  expect(result.status).toBe(0);
  expect(result.stderr).toBe('');
  const schema = JSON.parse(result.stdout);
  expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
  expect(schema.properties.input).toBeDefined();
  expect(schema.properties.audio).toBeUndefined();
});

test('schema CLI rejects unknown selections and extra arguments with usage status', () => {
  for (const args of [['__proto__'], ['live', 'project'], ['--unknown']]) {
    const result = spawnSync(process.execPath, [cli, 'schema', ...args], {
      cwd: tmpdir(),
      encoding: 'utf8',
    });
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('setcast schema');
  }
});
