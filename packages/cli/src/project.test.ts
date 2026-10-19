import { execFileSync } from 'node:child_process';
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vite-plus/test';

test('loads a real project without importing the export adapter or Remotion', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'setcast-independent-load-'));
  try {
    await copyFile(
      new URL('../../core/src/node/fixtures/probe-tone.mp3', import.meta.url),
      join(dir, 'tone.mp3'),
    );
    await writeFile(join(dir, 'theme.css'), '');
    await writeFile(
      join(dir, 'setcast.yaml'),
      'audio: tone.mp3\ntheme: ./theme.css\nplays: [{at: 0, title: Probe}]\n',
    );
    const script = `
      import { registerHooks } from 'node:module';
      registerHooks({ resolve(specifier, context, next) {
        if (specifier === 'remotion' || ['remotion/', '@remotion/', '@setcast/renderer-remotion'].some(prefix => specifier.startsWith(prefix))) {
          throw new Error('Unexpected renderer import: ' + specifier);
        }
        return next(specifier, context);
      } });
      const { load } = await import(process.argv[1]);
      const { project } = await load(process.argv[2]);
      process.stdout.write(JSON.stringify(project.mix.duration));
    `;
    const output = execFileSync(
      process.execPath,
      ['--input-type=module', '-e', script, new URL('./project.ts', import.meta.url).href, dir],
      { encoding: 'utf8' },
    );
    expect(JSON.parse(output)).toBe(1_272_000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
