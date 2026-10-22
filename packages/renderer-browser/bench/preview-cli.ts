import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';

export async function checkPreviewCli(directory: string) {
  const config = join(directory, 'setcast.yaml');
  const original = await readFile(config, 'utf8');
  await writeFile(config, `${original}\nrenderer: browser\n`);
  const port = await unusedPort();
  const child = startPreview(directory, port);
  const exited = once(child, 'exit');
  let output = '';
  child.stdout.on('data', (bytes) => {
    output += String(bytes);
  });
  child.stderr.on('data', (bytes) => {
    output += String(bytes);
  });
  const url = `http://127.0.0.1:${port}/preview.json`;
  try {
    await pollRevision(url, (value) => value.project?.title === 'Export acceptance');
    await writeFile(config, `${original}\nrenderer: browser\noutput: [invalid]\n`);
    const invalid = await pollRevision(url, (value) => Boolean(value.error));
    assert.equal(invalid.revision, 0);
    assert.equal(invalid.project.title, 'Export acceptance');
    await writeFile(
      config,
      `${original.replace('Export acceptance', 'CLI reloaded')}\nrenderer: browser\n`,
    );
    await pollRevision(url, (value) => value.project?.title === 'CLI reloaded' && !value.error);
  } catch (error) {
    throw new Error(`${String(error)}\n${output}`);
  } finally {
    child.kill('SIGTERM');
    const abort = new AbortController();
    try {
      await Promise.race([
        exited,
        setTimeout(5000, undefined, { signal: abort.signal }).then(() => {
          child.kill('SIGKILL');
          throw new Error('Preview did not stop cleanly');
        }),
      ]);
    } finally {
      abort.abort();
    }
    await writeFile(config, original);
  }
  assert.equal(child.exitCode, 0, output);
  await assert.rejects(fetch(url));
}
async function unusedPort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}
async function pollRevision(
  url: string,
  matches: (value: {
    revision: number;
    error: string | null;
    project: { title: string };
  }) => boolean,
) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const value = await (await fetch(url)).json();
      if (matches(value)) return value;
    } catch {
      /* The process may still be starting. */
    }
    await setTimeout(100);
  }
  throw new Error('Timed out waiting for preview revision');
}

function startPreview(directory: string, port: number) {
  const hook = String.raw`import { registerHooks } from 'node:module';
    registerHooks({resolve(specifier, context, next) {
      if (specifier === 'remotion' || ['remotion/', '@remotion/', '@setcast/renderer-remotion'].some(prefix => specifier.startsWith(prefix)))
        throw new Error('Preview imported Remotion: ' + specifier);
      return next(specifier, context);
    }});`;
  const child = spawn(
    process.execPath,
    [
      '--import',
      `data:text/javascript,${encodeURIComponent(hook)}`,
      'packages/cli/bin/setcast.js',
      'preview',
      directory,
      '--port',
      String(port),
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  return child;
}
