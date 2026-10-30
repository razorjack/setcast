import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createFixture, fixtureProject } from '../../../scripts/export-acceptance/fixture.ts';
import { render, type BrowserRenderOptions } from '../src/export/index.ts';
import { checkpointPath } from '../src/export/checkpoint.ts';
import type { ResolvedProject } from '@setcast/core';

const { values } = parseArgs({ options: { hardware: { type: 'boolean' } } });
const root = await mkdtemp(join(tmpdir(), 'setcast-resume-'));
const artifacts = resolve(
  values.hardware ? 'examples/demo/out/resume-hardware-check' : 'examples/demo/out/resume-check',
);
await mkdir(artifacts, { recursive: true });
const out = join(artifacts, 'resumed.mp4');
const cache = checkpointPath(out);
const backup = join(root, 'checkpoint-backup');
const options: BrowserRenderOptions = {
  projectDir: root,
  out,
  range: [0, 2.5],
  chunkSeconds: 1,
  concurrency: 1,
  resume: true,
  ...(values.hardware ? ({ hardwareAcceleration: 'required', videoBitrate: '12M' } as const) : {}),
};
const sentinel = Buffer.from('existing output must survive interruption');
const results: Record<string, { captured: number; reused: number }> = {};

function frameHashes(file: string) {
  return execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:v', '-f', 'framemd5', '-'], {
    encoding: 'utf8',
  });
}
async function restore() {
  await rm(cache, { recursive: true, force: true });
  await cp(backup, cache, { recursive: true });
}
async function measured(
  name: string,
  project: ResolvedProject,
  overrides: Partial<BrowserRenderOptions> = {},
) {
  let captured = 0;
  let reused = 0;
  await render(project, {
    ...options,
    ...overrides,
    onMetrics: (metric) => {
      if (metric.kind === 'frame') captured++;
    },
    onProgress: (event) => {
      reused = Math.max(reused, event.reusedFrames ?? 0);
    },
  });
  results[name] = { captured, reused };
  assert(!existsSync(cache), `${name}: successful export retained checkpoints`);
  process.stdout.write(`  ${name}: ${captured} captured, ${reused} reused\n`);
  return results[name]!;
}

try {
  await createFixture(root);
  const project = await fixtureProject(root);
  const reference = join(artifacts, 'reference.mp4');
  await render(project, { ...options, resume: false, out: reference });
  await writeFile(out, sentinel);
  await rm(cache, { recursive: true, force: true });
  const controller = new AbortController();
  await assert.rejects(
    render(project, {
      ...options,
      signal: controller.signal,
      onProgress: (event) => {
        if (event.stage === 'frames' && (event.renderedFrames ?? 0) >= 33)
          controller.abort(new Error('fixture interruption'));
      },
    }),
    /fixture interruption/,
  );
  assert((await readFile(out)).equals(sentinel), 'Interruption replaced an existing output');
  const manifest = JSON.parse(await readFile(join(cache, 'manifest.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest.chunks), ['0'], 'Partial chunk entered the manifest');
  assert(!existsSync(join(cache, 'lock.json')), 'Cancellation left a writer lock');
  await cp(cache, backup, { recursive: true });
  assert.deepEqual(await measured('resume', project), { captured: 45, reused: 30 });
  assert.equal(
    frameHashes(out),
    frameHashes(reference),
    'Resumed frames differ from uninterrupted export',
  );

  await restore();
  const corrupt = await readFile(join(cache, 'chunk-0.mp4'));
  corrupt[Math.floor(corrupt.length / 2)]! ^= 1;
  await writeFile(join(cache, 'chunk-0.mp4'), corrupt);
  assert.deepEqual(await measured('corrupt chunk', project), { captured: 75, reused: 0 });
  await restore();
  await rm(join(cache, 'chunk-0.mp4'));
  assert.deepEqual(await measured('missing chunk', project), { captured: 75, reused: 0 });

  const art = await readFile(join(root, 'art.svg'));
  await restore();
  await writeFile(join(root, 'art.svg'), art.toString().replace('#092736', '#442736'));
  assert.equal((await measured('changed artwork', project)).reused, 0);
  await writeFile(join(root, 'art.svg'), art);
  const audio = await readFile(join(root, 'tone.wav'));
  const altered = Buffer.from(audio);
  altered.writeInt16LE(300, 48);
  await restore();
  await writeFile(join(root, 'tone.wav'), altered);
  assert.equal((await measured('changed audio', project)).reused, 0);
  await writeFile(join(root, 'tone.wav'), audio);
  await restore();
  assert.equal(
    (
      await measured('changed configuration', {
        ...project,
        performance: { intensity: 1, brightness: 0.7 },
      })
    ).reused,
    0,
  );
  await restore();
  assert.equal(
    (
      await measured(
        'changed encoder settings',
        project,
        values.hardware ? { videoBitrate: '8M' } : { crf: 27 },
      )
    ).reused,
    0,
  );
  if (values.hardware) {
    await restore();
    assert.equal(
      (await measured('changed encoder backend', project, { hardwareAcceleration: 'disable' }))
        .reused,
      0,
    );
  }
  await restore();
  assert.equal(
    (
      await measured('relative asset paths', {
        ...project,
        audio: './tone.wav',
        background: './art.svg',
      })
    ).captured,
    75,
  );

  await restore();
  const muxAbort = new AbortController();
  await assert.rejects(
    render(project, {
      ...options,
      signal: muxAbort.signal,
      onProgress: (event) => {
        if (event.stage === 'encode') muxAbort.abort(new Error('mux interruption'));
      },
    }),
    /mux interruption/,
  );
  assert.deepEqual(await measured('all chunks complete', project), { captured: 0, reused: 75 });
  assert.equal(frameHashes(out), frameHashes(reference));

  await restore();
  let changed = false;
  await assert.rejects(
    render(project, {
      ...options,
      onProgress: (event) => {
        if (!changed && event.stage === 'frames') {
          changed = true;
          writeFileSync(join(root, 'tone.wav'), altered);
        }
      },
    }),
    /input changed/,
  );
  await writeFile(join(root, 'tone.wav'), audio);
  await rm(cache, { recursive: true, force: true });
  await assert.rejects(
    render(
      {
        ...project,
        css:
          project.css +
          '\n.setcast { background-image: image-set("http://127.0.0.1:1/untracked.png" 1x); }',
      },
      options,
    ),
    /untracked resource/,
  );
  await writeFile(join(artifacts, 'result.json'), JSON.stringify(results, null, 2));
  process.stdout.write(
    'Resume: PASS (cancellation, checksums, asset/configuration changes, complete checkpoints and untracked resources)\n',
  );
} finally {
  await rm(cache, { recursive: true, force: true });
  await rm(root, { recursive: true, force: true });
}
