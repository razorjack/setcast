import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vite-plus/test';

const cli = fileURLToPath(new URL('../../bin/setcast.js', import.meta.url));

function selectedPreview(directory: string, override?: string) {
  return spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import { registerHooks } from 'node:module';
    registerHooks({ resolve(specifier, context, next) {
      const choices = { '@setcast/renderer-remotion': 'REMOTION', '@setcast/renderer-browser/preview': 'BROWSER' };
      const selected = choices[specifier];
      if (!selected) return next(specifier, context);
      const source = 'export function resolveHardwareEncoding() { return { hardwareAcceleration: "disable" }; } export function preview() { throw new Error("SELECTED_' + selected + '"); }';
      return { url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true };
    }});
    process.argv = [process.execPath, ${JSON.stringify(cli)}, 'preview', ${JSON.stringify(directory)}, ...${JSON.stringify(override ? ['--renderer', override] : [])}];
    await import(${JSON.stringify(cli)});
  `,
    ],
    { encoding: 'utf8', timeout: 10_000 },
  );
}

test('preview renderer overrides select the requested adapter in both directions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'setcast-preview-selection-'));
  try {
    await writeFile(join(directory, 'tone.wav'), wave());
    await writeFile(join(directory, 'theme.css'), '');
    for (const configured of ['remotion', 'browser']) {
      await writeFile(
        join(directory, 'setcast.yaml'),
        `audio: tone.wav\ntheme: ./theme.css\nrenderer: ${configured}\nplays: [{ at: 0, title: Fixture }]\n`,
      );
      for (const override of [undefined, 'browser', 'remotion']) {
        const result = selectedPreview(directory, override);
        const expected = `SELECTED_${(override ?? configured).toUpperCase()}`;
        expect(`${result.stdout}${result.stderr}`, result.error?.message).toContain(expected);
        expect(result.signal).toBeNull();
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function wave() {
  const buffer = Buffer.alloc(44 + 16000);
  buffer.write('RIFF');
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24);
  buffer.writeUInt32LE(16000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(16000, 40);
  return buffer;
}
