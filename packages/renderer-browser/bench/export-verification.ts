import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const execute = promisify(execFile);
const root = resolve('examples/demo/out/export-verification');
await mkdir(root, { recursive: true });
const out = await mkdtemp(join(root, 'run-'));
await execute('ffmpeg', [
  '-v',
  'error',
  '-f',
  'lavfi',
  '-i',
  'anoisesrc=color=pink:amplitude=0.4:sample_rate=48000:seed=42:d=14',
  '-f',
  'lavfi',
  '-i',
  'anoisesrc=color=pink:amplitude=0.4:sample_rate=48000:seed=43:d=14',
  '-filter_complex',
  '[0:a][1:a]amerge=inputs=2[a]',
  '-map',
  '[a]',
  '-c:a',
  'pcm_s16le',
  join(out, 'source.wav'),
]);
await writeFile(
  join(out, 'setcast.yaml'),
  JSON.stringify({
    audio: 'source.wav',
    output: { width: 320, height: 180, fps: 30 },
    visualizer: [],
  }),
);
const workload = {
  version: 1,
  mode: 'export',
  project: out,
  seconds: 10,
  at: 2.013,
  verification: 'decoded',
};
const config = join(out, 'workload.json');
await writeFile(config, JSON.stringify(workload));
const positive = await runCheck('positive');
assert.equal(positive.status, 'passed');
assert.equal(positive.details.verification.expected.sourceAt, 2);
assert.equal(positive.details.verification.video.streams[0].nb_read_frames, '300');
assert(
  positive.details.verification.audio.every(
    (check: AudioCheck) => check.result.status === 'passed',
  ),
);
const video = join(out, 'positive/export.mp4');
await alter('shifted', ['-af', 'adelay=20|20,atrim=duration=10', '-c:a', 'aac', '-b:a', '320k']);
const shifted = await runCheck('shifted', join(out, 'shifted.mp4'));
assert.equal(shifted.status, 'failed');
assert(
  shifted.details.verification.audio.every(
    (check: AudioCheck) => check.result.status === 'shifted',
  ),
);
await alter('truncated', ['-c:a', 'copy', '-t', '9']);
const truncated = await runCheck('truncated', join(out, 'truncated.mp4'));
assert.equal(truncated.status, 'failed');
assert(
  truncated.details.verification.video.errors.some((error: string) =>
    error.includes('frame count'),
  ),
);
await alter('silent', ['-af', 'volume=0', '-c:a', 'aac']);
const silent = await runCheck('silent', join(out, 'silent.mp4'));
assert.equal(silent.status, 'failed');
assert(
  silent.details.verification.audio.every(
    (check: AudioCheck) => check.result.status === 'mismatch',
  ),
);
const metadataConfig = join(out, 'metadata.json');
await writeFile(metadataConfig, JSON.stringify({ ...workload, verification: 'metadata' }));
await execute(process.execPath, [
  'packages/renderer-browser/bench/endurance.ts',
  '--config',
  metadataConfig,
  '--out',
  join(out, 'metadata'),
  '--verify-video',
  video,
]);
assert.equal(
  JSON.parse(await readFile(join(out, 'metadata/report.json'), 'utf8')).status,
  'passed',
);
await writeFile(config, JSON.stringify({ ...workload, audioAt: [1, 4, 8] }));
const selected = await runCheck('selected', video);
assert.equal(selected.status, 'passed');
assert.deepEqual(
  selected.details.verification.audio.map((check: { at: number }) => check.at),
  [1, 4, 8],
);
await writeFile(config, JSON.stringify({ ...workload, audioAt: [9.5] }));
const outside = await runCheck('outside', video);
assert.equal(outside.status, 'failed');
assert.match(outside.errors[0], /rounded export duration/);
process.stdout.write(
  `Export verification: PASS (decoded video, rounded origin, shifted audio, truncation, silence, metadata). ${out}\n`,
);

type AudioCheck = { result: { status: string } };
async function runCheck(name: string, existing?: string) {
  let succeeded = true;
  try {
    await execute(
      process.execPath,
      [
        'packages/renderer-browser/bench/endurance.ts',
        '--config',
        config,
        '--out',
        join(out, name),
        ...(existing ? ['--verify-video', existing] : []),
      ],
      { maxBuffer: 1024 * 1024 },
    );
  } catch {
    succeeded = false;
  }
  const report = JSON.parse(await readFile(join(out, name, 'report.json'), 'utf8'));
  assert.equal(succeeded, report.status === 'passed', JSON.stringify(report.errors));
  return report;
}

async function alter(name: string, args: string[]) {
  await execute('ffmpeg', [
    '-v',
    'error',
    '-i',
    video,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0',
    '-c:v',
    'copy',
    ...args,
    join(out, `${name}.mp4`),
  ]);
}
