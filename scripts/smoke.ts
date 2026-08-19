// Renders 3 s of examples/demo and fails loudly unless the MP4 has an H.264 video track, an AAC
// audio track, and (when ffmpeg is available) visibly different frames. Run: vp run smoke
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const demo = join(root, 'examples/demo');
const audio = join(demo, 'assets/demo-set.wav');
const out = join(demo, 'out/smoke.mp4');
const range = '0:32-0:35';

const fail = (msg: string): never => {
  console.error(`\nsmoke: FAIL – ${msg}`);
  process.exit(1);
};

if (!existsSync(audio)) {
  console.log('smoke: demo audio missing, generating it');
  execFileSync(process.execPath, [join(root, 'scripts/make-demo-assets.ts')], { stdio: 'inherit' });
}

console.log(`smoke: rendering ${range} of examples/demo → out/smoke.mp4`);
const render = spawnSync(
  process.execPath,
  [join(root, 'packages/cli/bin/setcast.js'), 'render', '--range', range, '--out', 'out/smoke.mp4'],
  { cwd: demo, stdio: 'inherit', env: { ...process.env, FORCE_COLOR: '1' } },
);
if (render.status !== 0) fail(`setcast render exited with ${render.status}`);

const size = statSync(out).size;
if (size < 100_000) fail(`out/smoke.mp4 is only ${size} bytes; expected a real 3 s 1080p clip`);

const bytes = readFileSync(out).toString('latin1');
for (const box of ['ftyp', 'moov', 'avc1', 'mp4a']) {
  if (!bytes.includes(box))
    fail(
      `MP4 is missing the "${box}" box (${box === 'mp4a' ? 'no AAC audio track' : 'broken container'})`,
    );
}
console.log(`smoke: container ok (${(size / 1e6).toFixed(2)} MB, h264 + aac)`);

const ffmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
if (ffmpeg.status === 0) {
  const dir = mkdtempSync(join(tmpdir(), 'setcast-smoke-'));
  const frame = (t: string, name: string) => {
    const file = join(dir, name);
    execFileSync('ffmpeg', [
      '-loglevel',
      'error',
      '-y',
      '-ss',
      t,
      '-i',
      out,
      '-frames:v',
      '1',
      file,
    ]);
    return readFileSync(file);
  };
  const a = frame('0.3', 'a.png');
  const b = frame('2.4', 'b.png');
  if (a.equals(b)) fail('frames at 0.3 s and 2.4 s are identical; visuals are not moving');
  console.log('smoke: frames differ over time (visuals are moving)');
} else {
  console.log('smoke: ffmpeg not found, skipping the moving-frames check');
}
console.log('smoke: PASS');
