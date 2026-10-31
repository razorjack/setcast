import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { setTimeout } from 'node:timers/promises';

export async function checkInstalledPreview(cli: string, project: string) {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const address = reservation.address();
  assert(address && typeof address !== 'string');
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const child = spawn(process.execPath, [cli, 'preview', project, '--port', String(address.port)], {
    cwd: project,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exited = once(child, 'exit');
  let output = '';
  child.stdout.on('data', (bytes) => {
    output += String(bytes);
  });
  child.stderr.on('data', (bytes) => {
    output += String(bytes);
  });
  try {
    const base = `http://127.0.0.1:${address.port}/`;
    await waitForPreview(new URL('preview.json', base), child);
    const state = (await (await fetch(new URL('preview.json', base))).json()) as {
      project: { title: string };
    };
    assert.equal(state.project.title, 'Installed default commands');
    const queue = (await (await fetch(new URL('exports', base))).json()) as {
      jobs: unknown[];
      token: string;
    };
    assert.equal(queue.jobs.length, 0);
    assert.equal(typeof queue.token, 'string');
  } catch (error) {
    throw new Error(`${String(error)}\n${output}`, { cause: error });
  } finally {
    child.kill('SIGTERM');
    const abort = new AbortController();
    try {
      await Promise.race([
        exited,
        setTimeout(5000, undefined, { signal: abort.signal }).then(() => {
          child.kill('SIGKILL');
          throw new Error('Installed preview did not stop within five seconds');
        }),
      ]);
    } finally {
      abort.abort();
    }
  }
}

async function waitForPreview(url: URL, child: ReturnType<typeof spawn>) {
  for (let attempt = 0; attempt < 300; attempt++) {
    assert.equal(child.exitCode, null, 'Installed preview exited before becoming ready');
    try {
      if ((await fetch(url)).ok) return;
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
    }
    await setTimeout(100);
  }
  throw new Error('Installed preview did not become ready within thirty seconds');
}
